// The SkySystem: the one object the whole volumetric sky hangs off.
//
// It owns the dome, the cloud subsystem and its temporal reconstruction, the
// day/night clock, and every piece of atmospheric state. Nothing below it knows
// about anything above it — the dome does not know the clouds exist, the clock
// does not know a renderer exists — so this file is where the wiring, the frame
// order, and the lifetime live.
//
// `SkySystem` is ToonLab's stable public API. Keep its names, argument order,
// and semantics backward-compatible.
//
// Two ordering rules the rest of this file exists to enforce:
//
//   1. Clouds are NOT a post stage. They are marched into a reconstruction
//      buffer by `update()` and drawn IN THE SCENE by a backdrop mesh, so opaque
//      geometry occludes them and host transparency draws over them. Only the
//      aerial-perspective fog and the god rays are post stages, and those are
//      what `applyTo` returns.
//   2. The clock owns the sun's direction whenever it is running. `applyPreset`
//      therefore lands the authored sun pose with the clock momentarily paused
//      (see the comment there) — otherwise a preset's `sun.elevation` would be
//      overwritten by the celestial solve before it could ever be read back, and
//      `toParams()` would not be the inverse of `applyPreset` that it claims.
//
// NOT BUILT YET, and honest about it rather than silently absent:
//
//   - The env-map bake (src/sky/skyEnvironment.js). Asking for it throws a
//     message naming the module, because handing back a dead env map is worse
//     than refusing.
//
// The night sky IS built, in src/sky/nightSky.js, and it is the one backdrop
// this file adds CONDITIONALLY: `sky.nightSky` is documented as null when no
// `nightSky` option was supplied, so a daylight-only host pays for no extra
// sphere. Everything about it beyond construction, scene membership, the frame
// tick and the `nightSky.intensity` param belongs to that module.
//
// The aerial-perspective fog IS built, here, because `applyTo` is useless
// without it. It is a private method rather than an export: when
// src/sky/skyFog.js lands, `#fogNode` becomes a call into it and nothing else in
// this file changes. Nothing about the stage is exported, so there is no
// second-owner hazard of the kind the spec's module-ownership table exists to
// prevent.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  If,
  exp,
  float,
  length,
  max,
  mix,
  normalize,
  saturate,
  screenUV,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { createCloudParams } from '../cloud/cloudParams.js';
import { createCloudStyleParams } from '../cloud/cloudStyle.js';
import { createCloudReprojection } from '../cloud/cloudReprojection.js';
import { createCloudVolumeMaterial } from '../cloud/cloudVolume.js';
import { getCloudBaseShapeVolume } from '../cloud/noise/baseShapeVolume.js';
import { getCloudCirrusMap } from '../cloud/noise/cirrusMap.js';
import { getCurlNoiseVolume } from '../cloud/noise/curlNoise.js';
import { getCloudErosionVolume } from '../cloud/noise/erosionVolume.js';
import { createWeatherMapProfile, getWeatherMap } from '../cloud/noise/weatherMap.js';
import { finiteNumber, isObject } from '../cloud/paramSchema.js';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';
import { createAtmosphereDome } from './atmosphereDome.js';
import { createAtmosphereParams } from './atmosphereParams.js';
import { atmosphereRaymarchNodes, createAtmosphereScattering } from './atmosphereScattering.js';
import { applySkyColorNode, createSkyColorParams } from './skyColor.js';
import {
  GOD_RAYS_PARAM_KEYS,
  GOD_RAYS_PARAM_SCHEMA,
  createGodRaysPass,
} from './godRays.js';
import {
  clearEnvironmentCloudShadowPass,
  createCloudShadowPass,
  sampleCloudShadowNode,
  syncEnvironmentCloudShadowPass,
} from './cloudShadow.js';
import { NIGHT_SKY_PARAM_SCHEMA, createNightSky } from './nightSky.js';
import { RenderLayer, placeInLayer } from './renderLayers.js';
import { createSkyParams } from './skyParams.js';
import {
  CLOUD_MARCH_BUDGET,
  DEFAULT_QUALITY_LEVEL,
  resolveQuality,
  resolveQualityLevelName,
} from './skyQualityTiers.js';
import { createSun, createSunDriver, sunDirectionAt } from './sunDriver.js';
import { createTimeOfDay } from './timeOfDay.js';

/**
 * Steps in the fog stage's own sky march.
 *
 * Half the dome's 32, and the halving is invisible by construction: fog only
 * ever *fades toward* this radiance, so the two differ most where the mix weight
 * is smallest. It is a per-pixel march on every geometry pixel, which is why it
 * is not simply the dome's count.
 */
const FOG_SKY_MARCH_STEPS = 16;

// Where the cloud backdrop sits, as fractions of the camera's far plane and
// multiples of the cloud march ceiling.
//
// NOT at the far plane, and the reason is measured rather than cautious. A
// hyperbolic depth buffer has no usable resolution left out there: with the
// documented near 0.1 / far 1e6 camera, an untouched depth texel — the far plane
// itself — reconstructs through `perspectiveDepthToViewZ` as 0.8 * far, i.e. two
// least-significant bits of a 24-bit buffer land 200 km from where they belong,
// identically on the WebGPU and WebGL2 backends. A backdrop placed at 0.98 * far
// is therefore *behind* the cleared depth and every pixel of it is rejected.
//
// So the backdrop sits a tenth of the way out, floored well past the marcher's
// own horizon (`fade.maxMarchDist`, where cloud stops existing at all) and capped
// at half the far plane for a host with a short one. At the documented camera
// that is 100 km: any geometry nearer occludes the cloud, which is the whole
// contract, and geometry beyond 100 km is past the deck's own horizon.
const CLOUD_LAYER_FAR_FRACTION = 0.1;
const CLOUD_LAYER_FAR_CAP = 0.5;
const CLOUD_LAYER_MARCH_MARGIN = 1.5;

/**
 * A pixel closer than this fraction of the far plane is showing geometry.
 *
 * Generous on purpose, for the depth-precision reason above: an untouched depth
 * texel reconstructs as 0.8 * far, not far, so the obvious 0.999 classified the
 * ENTIRE SKY as distant geometry. The fog then replaced every sky pixel with its
 * own sky march — which looks almost identical to the dome, so the frame appeared
 * fine while the cloud layer underneath it was being overwritten and no cloud
 * ever reached the screen. 0.5 leaves a 1.6x margin under the measured value.
 *
 * The cost of being generous is that geometry past half the far plane is not
 * fogged. At that distance the fog has long since saturated to the sky colour
 * anyway, and `atmosphere.fogFarFadeStart` is the knob for the world's rim.
 */
const SKY_DEPTH_FRACTION = 0.5;

// Per-frame scratch. `#refreshCamera` runs once a frame and must not allocate;
// nothing reads these across a call, so one set serves every system in the page.
const rightScratch = new THREE.Vector3();
const upScratch = new THREE.Vector3();
const forwardScratch = new THREE.Vector3();

// Same boolean rule as src/sky/skyQualityTiers.js and src/cloud/paramSchema.js:
// a real boolean, or the 0/1 a URL parameter or a store round-trip produces.
// `Boolean(value)` would read the string 'false' as true.
function readBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function clampToRange(range, value, fallback) {
  const next = finiteNumber(value);
  if (next === null) return fallback;
  if (!range) return next;
  return Math.min(Math.max(next, range.min), range.max);
}

function isNode(value) {
  return Boolean(value) && typeof value === 'object' && value.isNode === true;
}

/**
 * Normalises the `nightSky` option into the bag `createNightSky` takes, or null.
 *
 * `true` is accepted alongside an object because the two mean the same thing —
 * "give me a night sky" — and the documented bag has no required field: with no
 * `texture` the panorama is black and the moon still rises, which the reference
 * states outright ("Omit the option and the night sky renders black", against a
 * `nightSky` whose fields are all optional).
 *
 * Both texture slots may be a URL, and neither is resolved here: a string cannot
 * become a THREE.Texture without awaiting, so `SkySystem.create` — which is
 * already async — loads them first and hands this function real textures. The
 * throw below is therefore about the ONE path that cannot work, direct
 * construction with a URL, and it says which call does.
 */
function resolveNightSkyOptions(option) {
  if (option === undefined || option === null || option === false) return null;
  const bag = isObject(option) ? option : {};
  if (!isObject(option) && option !== true) {
    throw new TypeError(
      'SkySystem nightSky must be an options object (or true for the defaults), '
      + `not ${typeof option}.`,
    );
  }

  const resolved = {};
  for (const key of ['texture', 'moonTexture']) {
    const value = bag[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      throw new TypeError(
        `SkySystem nightSky.${key} is a URL, which only the async factory can load. `
        + 'Use `await SkySystem.create(options)` instead of `new SkySystem(options)`, '
        + 'or pass a THREE.Texture you loaded yourself.',
      );
    }
    if (value.isTexture !== true) {
      throw new TypeError(
        `SkySystem nightSky.${key} must be a URL string or a THREE.Texture.`,
      );
    }
    resolved[key] = value;
  }

  // Ownership defaults to false — a host's texture is the host's to dispose —
  // and `create` sets it true for the ones it loaded itself.
  if (bag.ownsTexture !== undefined) resolved.ownsTexture = readBoolean(bag.ownsTexture, false);
  if (bag.ownsMoonTexture !== undefined) {
    resolved.ownsMoonTexture = readBoolean(bag.ownsMoonTexture, false);
  }
  if (bag.radius !== undefined) resolved.radius = bag.radius;
  if (bag.intensity !== undefined) resolved.intensity = bag.intensity;
  return resolved;
}

/**
 * Loads the `nightSky` texture fields that arrived as URLs.
 *
 * Rejects rather than falling back to black. The night-sky module's own rule is
 * that an ABSENT panorama renders black because that is what the host asked for;
 * a panorama that was asked for and failed to arrive is a different thing, and
 * quietly swallowing it is exactly the "black sky while a starmap was supplied"
 * this file refuses elsewhere. Loading happens before the SkySystem exists, so a
 * rejection leaves nothing built and nothing to clean up.
 */
async function loadNightSkyTextures(option) {
  if (!isObject(option)) return option;
  const urls = ['texture', 'moonTexture'].filter((key) => typeof option[key] === 'string');
  if (urls.length === 0) return option;

  const loader = new THREE.TextureLoader();
  // allSettled rather than all: with a starmap and a moon map both given as
  // URLs, `all` rejects on the first failure while the other download is still
  // in flight, and the texture that DOES arrive is then owned by nobody. Every
  // outcome is collected, then either all of them are kept or all of them are
  // freed.
  const settled = await Promise.allSettled(urls.map((key) => loader.loadAsync(option[key])));

  const failure = settled.findIndex((outcome) => outcome.status === 'rejected');
  if (failure >= 0) {
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') outcome.value.dispose();
    }
    throw new Error(
      `SkySystem could not load nightSky.${urls[failure]} from "${option[urls[failure]]}".`,
      { cause: settled[failure].reason },
    );
  }

  const resolved = { ...option };
  urls.forEach((key, index) => {
    const map = settled[index].value;
    map.name = map.name || `SkySystemNight_${key}`;
    resolved[key] = map;
    // This system loaded it, so this system disposes it — unless the caller
    // already said otherwise about that slot.
    const ownsKey = key === 'texture' ? 'ownsTexture' : 'ownsMoonTexture';
    if (resolved[ownsKey] === undefined) resolved[ownsKey] = true;
  });
  return resolved;
}

/**
 * The live `godRays` group.
 *
 * Built here from the schema src/sky/godRays.js owns rather than re-declaring
 * one field: this is a live-object factory, not a second definition of the group,
 * and it is not exported, so the `conflicting star exports` hazard the spec's
 * ownership table guards against does not arise. It moves into godRays.js
 * alongside the march when that lands.
 *
 * `enabled` and `moonGodRayScale` are plain properties and the other four are
 * uniforms, which is what the reference publishes. `steps` is a uniform and
 * deliberately not a params field — the quality tier owns it.
 */
function createGodRaysGroup(params = {}) {
  const uniforms = {
    strength: uniform(GOD_RAYS_PARAM_SCHEMA.strength.value),
    sharpness: uniform(GOD_RAYS_PARAM_SCHEMA.sharpness.value),
    extinction: uniform(GOD_RAYS_PARAM_SCHEMA.extinction.value),
    maxDistance: uniform(GOD_RAYS_PARAM_SCHEMA.maxDistance.value),
  };

  const group = {
    ...uniforms,
    enabled: GOD_RAYS_PARAM_SCHEMA.enabled.value,
    moonGodRayScale: GOD_RAYS_PARAM_SCHEMA.moonGodRayScale.value,
    steps: uniform(24),

    applyParams(next = {}) {
      const source = isObject(next) ? next : {};
      if ('enabled' in source) group.enabled = readBoolean(source.enabled, group.enabled);
      if ('moonGodRayScale' in source) {
        group.moonGodRayScale = clampToRange(
          GOD_RAYS_PARAM_SCHEMA.moonGodRayScale.range,
          source.moonGodRayScale,
          group.moonGodRayScale,
        );
      }
      for (const key of Object.keys(uniforms)) {
        if (!(key in source)) continue;
        uniforms[key].value = clampToRange(
          GOD_RAYS_PARAM_SCHEMA[key].range,
          source[key],
          uniforms[key].value,
        );
      }
      return group;
    },

    toParams() {
      const params = {};
      for (const key of GOD_RAYS_PARAM_KEYS) {
        params[key] = key in uniforms ? uniforms[key].value : group[key];
      }
      return params;
    },
  };

  return group.applyParams(params);
}

/**
 * The top-level sky. Build it with {@link SkySystem.create}, which is async
 * because it waits for the renderer's backend and generates the cloud noise
 * volumes before the first frame can be rendered.
 */
export class SkySystem {
  /** Host cost policy. Disable only when no receivers need cloud shadows. */
  cloudShadowsEnabled = true;
  #renderer;
  #camera;
  #scene;

  #atmosphere;
  #skyColor;
  #scattering;
  #timeOfDay;
  #sun;
  #sunDriver;
  #clouds;
  #cloudStyle;
  #godRays;
  #nightSky = null;
  #nightSkyParams;

  #qualityName;
  #qualityOverrides;
  #quality;

  #noise;
  #dome;
  #cloud;
  #cloudShadow;
  #cloudShadowMapNode;
  #reprojection;
  #cloudLayer;
  #cloudTextureNode;
  #cloudHitTextureNode;
  #cloudWeatherOverride = null;
  #godRayPass;

  #post;
  #cssWidth = 1;
  #cssHeight = 1;
  #disposed = false;

  /**
   * @param {object} options
   * @param {THREE.WebGPURenderer} options.renderer required — the renderer the
   *   sky draws with, on either the WebGPU or the WebGL2 backend.
   * @param {THREE.PerspectiveCamera} options.camera required.
   * @param {THREE.Scene} options.scene required — the sky adds its backdrops to
   *   it, and `dispose()` removes them again.
   * @param {string} [options.quality='high'] quality tier.
   * @param {boolean} [options.godRays] overrides the tier's god-ray switch.
   * @param {object|true} [options.nightSky] star panorama options:
   *   `{ texture, moonTexture, radius = 100000, intensity = 0.3 }`. Either
   *   texture may be a URL — this factory loads it before building — or a
   *   preloaded THREE.Texture, which stays the caller's to dispose unless
   *   `ownsTexture` / `ownsMoonTexture` hands it over. Omit `texture` and the
   *   panorama renders black while the moon still rises; omit the whole option
   *   and `sky.nightSky` is null.
   * @param {object} [options.timeOfDay] starting time, latitude and moon state.
   * @returns {Promise<SkySystem>}
   */
  static async create(options = {}) {
    const { renderer, camera, scene } = isObject(options) ? options : {};
    if (!renderer?.isRenderer && typeof renderer?.render !== 'function') {
      throw new TypeError('SkySystem.create needs a renderer.');
    }
    if (!camera?.isCamera) throw new TypeError('SkySystem.create needs a camera.');
    if (!scene?.isScene) throw new TypeError('SkySystem.create needs a scene.');

    // Idempotent, and it returns the shared init promise, so this is also the
    // right call for a host that already awaited it: the backend has to be up
    // before any material is built or any render target allocated.
    if (typeof renderer.init === 'function') await renderer.init();

    // After the backend, before the constructor. After, because a texture
    // uploaded through a renderer that has not initialised has nowhere to go;
    // before, because the constructor is synchronous and a URL that only
    // resolved later would leave the first frames starless.
    const nightSky = await loadNightSkyTextures(options.nightSky);
    return new SkySystem(nightSky === options.nightSky ? options : { ...options, nightSky });
  }

  constructor(options = {}) {
    const {
      renderer,
      camera,
      scene,
      quality = DEFAULT_QUALITY_LEVEL,
      godRays,
      nightSky,
      timeOfDay,
    } = isObject(options) ? options : {};

    // Validated before anything is built, so a bad option bag fails without
    // leaving a half-constructed system holding GPU resources.
    const nightSkyOptions = resolveNightSkyOptions(nightSky);

    this.#renderer = renderer;
    this.#camera = camera;
    this.#scene = scene;

    // --- atmospheric state, in dependency order ----------------------------
    this.#atmosphere = createAtmosphereParams();
    this.#skyColor = createSkyColorParams();
    this.#scattering = createAtmosphereScattering({ params: this.#atmosphere });
    this.#timeOfDay = createTimeOfDay(isObject(timeOfDay) ? timeOfDay : {});
    this.#sun = createSun();

    // A PAUSED clock frees `sun.direction` — sunDriver.js's rule, documented as
    // "0 pauses the clock, which also stops the driver from rewriting
    // sun.direction — pause it to hold a direction set through
    // sun.setFromAngles()". At construction there is no such direction to hold:
    // `createSun()` produced its default one line ago and SkySystem has no `sun`
    // option, so the rule would protect an arbitrary 45-degree noon sun against
    // a host that asked for midnight. `skyDarkness` would then be 0 at 00:29,
    // which turns the whole night sky off — stars, moon lift and all — and makes
    // the night sky look broken when what is wrong is the sun. So when the host
    // supplied a clock AND paused it, the clock's own solve IS the authored pose,
    // written here with the driver's own solver so there is no second copy of
    // the celestial arc. A running clock needs nothing: apply() re-solves on
    // every pass while `autoAdvanceSecondsPerDay > 0`, including its first.
    if (isObject(timeOfDay) && this.#timeOfDay.autoAdvanceSecondsPerDay === 0) {
      sunDirectionAt(
        this.#timeOfDay.foldTime(),
        this.#timeOfDay.latitude,
        this.#timeOfDay.azimuth,
        this.#sun.direction.value,
      );
    }

    // Constructed after the clock and the sun, which is the order sunDriver.js
    // documents: a paused clock then adopts its opening reading rather than
    // claiming the sun's direction, so the pose above survives construction and
    // every derived term — darkness, the moon's direction, the star rotation —
    // is solved from it.
    this.#sunDriver = createSunDriver({ sun: this.#sun, timeOfDay: this.#timeOfDay });
    this.#clouds = createCloudParams();
    this.#cloudStyle = createCloudStyleParams();
    this.#godRays = createGodRaysGroup();
    this.#nightSkyParams = { intensity: NIGHT_SKY_PARAM_SCHEMA.intensity.value };

    this.#qualityName = resolveQualityLevelName(quality);
    this.#qualityOverrides = {};
    this.#quality = resolveQuality(this.#qualityName, this.#qualityOverrides);
    this.#godRays.steps.value = this.#quality.godRaySteps;
    // The tier sets the switch; an explicit option overrides it, which is what
    // `godRays optional — Default: from tier` means.
    this.#godRays.enabled = godRays === undefined
      ? this.#quality.godRaysEnabled
      : readBoolean(godRays, this.#quality.godRaysEnabled);

    // The noise block is live state, not a copy of the tier: the tier seeds the
    // weather resolution and a preset may then override it.
    this.#noise = {
      weather: {
        resolution: this.#quality.weatherMapResolution,
        seed: 1,
        profile: createWeatherMapProfile(),
      },
    };

    // --- the backdrops -----------------------------------------------------
    this.#dome = createAtmosphereDome({
      params: this.#atmosphere,
      scattering: this.#scattering,
      style: this.#skyColor,
      sun: this.#sun,
      timeOfDay: this.#timeOfDay,
    });
    markFactorySystemOwned(this.#dome.group, 'sky', 'toonlab/sky-system-atmosphere');
    scene.add(this.#dome.group);

    // The night sky, only when asked for — `sky.nightSky` is documented as null
    // otherwise, and the sphere is a real draw call that a daylight-only host
    // should not pay for. It goes in AFTER the dome because it is additive
    // radiance on top of the atmosphere: nightSky.js places its own group in
    // RenderLayer.backgroundOverlay, which is the only layer both blended and
    // behind scene content, and the dome owns the opaque `background` layer
    // underneath it.
    if (nightSkyOptions) {
      this.#nightSky = createNightSky({
        ...nightSkyOptions,
        style: this.#skyColor,
        timeOfDay: this.#timeOfDay,
      });
      markFactorySystemOwned(this.#nightSky.group, 'sky', 'toonlab/sky-system-night');
      scene.add(this.#nightSky.group);
      // The option's `intensity` won over the schema default inside
      // createNightSky and was clamped to the published range there, so the
      // serialized value is read back FROM the live object rather than
      // re-derived here — one clamp, one owner, and `toParams()` reports what
      // the sky is actually rendering.
      this.#nightSkyParams.intensity = this.#nightSky.toParams().intensity;
    }

    this.#cloud = createCloudVolumeMaterial({
      atmosphere: this.#atmosphere,
      params: this.#clouds,
      skyColor: this.#skyColor,
      style: this.#cloudStyle,
      quality: this.#qualityName,
      scattering: this.#scattering,
      seed: this.#noise.weather.seed,
      sun: this.#sun,
      timeOfDay: this.#timeOfDay,
      volumes: this.#resolveVolumes(),
    });

    // Post-stage uniforms. Owned here rather than read from TSL's camera
    // built-ins for the same reason cloudVolume.js owns its own: a post pass is
    // drawn by a fullscreen quad, and `cameraPosition` in that graph reports the
    // quad's camera, not the scene's.
    this.#post = {
      cameraPosition: uniform(new THREE.Vector3()),
      cloudsEnabled: uniform(1),
      far: uniform(camera.far ?? 1),
      rayBasis: uniform(new THREE.Matrix3()),
    };

    this.#cloudShadow = createCloudShadowPass({
      cloudVolume: this.#cloud,
      clouds: this.#clouds,
      groundReferenceY: this.#dome.groundLevel,
      resolution: this.#quality.cloudShadowResolution,
      sun: this.#sun,
      timeOfDay: this.#timeOfDay,
    });
    this.#cloudShadow.mipLevel.value = this.#quality.cloudShadowMipLevel;
    this.#cloudShadowMapNode = texture(this.#cloudShadow.texture);
    syncEnvironmentCloudShadowPass(this.#cloudShadow);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.#reprojection = this.#createReprojection(size.x, size.y);
    this.#cloudTextureNode = texture(this.#reprojection.texture);
    this.#cloudHitTextureNode = texture(this.#reprojection.hitDistanceTexture);
    this.#godRayPass = createGodRaysPass({
      atmosphere: this.#atmosphere,
      cameraPosition: this.#post.cameraPosition,
      cloudColorNode: this.#cloudTextureNode,
      cloudDepthNode: this.#cloudHitTextureNode,
      godRays: this.#godRays,
      shadowProjection: this.#cloudShadow.projection,
      shadowMapNode: this.#cloudShadowMapNode,
      sun: this.#sun,
      timeOfDay: this.#timeOfDay,
    });
    this.#cloudLayer = this.#createCloudLayer();
    markFactorySystemOwned(this.#cloudLayer.mesh, 'cloud', 'toonlab/sky-system-clouds');
    scene.add(this.#cloudLayer.mesh);

    const pixelRatio = renderer.getPixelRatio?.() ?? 1;
    this.#cssWidth = Math.max(1, size.x / pixelRatio);
    this.#cssHeight = Math.max(1, size.y / pixelRatio);

    // Every driven uniform valid before anything renders or bakes.
    this.#refreshCamera();
  }

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------

  /** Turbidity, exposure and scattering controls. */
  get atmosphere() {
    return this.#atmosphere;
  }

  /** Optional sky-colour grade. Its master switch off is the physical atmosphere. */
  get skyColor() {
    return this.#skyColor;
  }

  /** Cloud shape, lighting, wind, cirrus, haze and fade, plus `enabled`. */
  get clouds() {
    return this.#clouds;
  }

  /** Optional modular art direction. The master switch off is the V1 renderer. */
  get cloudStyle() {
    return this.#cloudStyle;
  }

  /** God-ray look knobs. The quality tier owns the march step count. */
  get godRays() {
    return this.#godRays;
  }

  /**
   * Star panorama, or null when no `nightSky` config was supplied.
   *
   * `intensity.value` scales the stars, `setTexture(map, ownsNewTexture)` swaps
   * the panorama, and `radianceNode` is the same graph the mesh draws — which is
   * what the env-map bake and water reflections will read rather than composing
   * a second definition of the night sky.
   */
  get nightSky() {
    return this.#nightSky;
  }

  /** The active tier name. Read-only: there is no setter, use setQualityLevel. */
  get qualityLevel() {
    return this.#qualityName;
  }

  /** The resolved tier config, tier merged with any overrides. Frozen. */
  get quality() {
    return this.#quality;
  }

  /** The march budget, fixed at 128 primary / 6 light steps for every tier. */
  get marchBudget() {
    return CLOUD_MARCH_BUDGET;
  }

  /** Sun direction, intensity, colour and disc size. */
  get sun() {
    return this.#sun;
  }

  /** Day/night clock. Drives the sun and moon positions. */
  get timeOfDay() {
    return this.#timeOfDay;
  }

  /**
   * Scrubs the package clock without running any render passes.
   *
   * A style coordinator may also provide its authored sun direction. The
   * driver is applied once to adopt the new clock, then again after the pose is
   * written so moon direction, night weight, star rotation and horizon fades
   * all agree with that pose. This is safe to call from UI/React effects while
   * the renderer owns the frame loop.
   *
   * @param {number} hour local hour, wrapped to a 24-hour day.
   * @param {object} [options]
   * @param {number} [options.autoAdvanceSecondsPerDay=0] 0 pauses the clock.
   * @param {THREE.Vector3|number[]} [options.sunDirection] optional world-space
   *   direction from the scene origin toward the sun.
   * @returns {object} the current derived celestial state.
   */
  setTimeOfDay(hour, {
    autoAdvanceSecondsPerDay = 0,
    sunDirection = null,
  } = {}) {
    this.#assertLive();
    const nextHour = finiteNumber(hour);
    const time = nextHour === null
      ? this.#timeOfDay.foldTime()
      : nextHour / 24;
    this.#timeOfDay.applyParams({ autoAdvanceSecondsPerDay, time });
    this.#sunDriver.apply();

    if (sunDirection) {
      const target = this.#sun.direction.value;
      if (sunDirection.isVector3) target.copy(sunDirection);
      else if (Array.isArray(sunDirection) && sunDirection.length >= 3) {
        target.fromArray(sunDirection);
      }
      if (target.lengthSq() > 0) target.normalize();
      this.#sunDriver.apply();
    }
    return this.#sunDriver.state;
  }

  /**
   * Align the cloud-transmittance bake with a scene directional key without
   * moving the visible celestial sun. Pass null to resume physical-sun input.
   */
  setCloudShadowDirection(direction = null) {
    this.#assertLive();
    return this.#cloudShadow.setLightDirection(direction);
  }

  /**
   * Opt-in opaque occlusion. Supply an unfiltered, linear color texture whose
   * red channel is positive view-space distance in metres, cleared to >=65000.
   * Render it with this camera BEFORE update(), excluding sky and transparent
   * objects. The host owns the texture. Pass null for legacy backdrop depth.
   */
  setSceneDepthTexture(map = null) {
    this.#assertLive();
    if (map && this.#cloud.sceneDepthNode.value === map) return;
    this.#cloud.setSceneDepthTexture(map);
    this.#cloudLayer.material.depthTest = map === null;
    this.#cloudLayer.material.needsUpdate = true;
    this.#reprojection.reset();
  }

  /** The sky dome. */
  get dome() {
    return this.#dome;
  }

  /** The cloud raymarcher. */
  get cloud() {
    return this.#cloud;
  }

  /** The cloud temporal reconstruction. */
  get reprojection() {
    return this.#reprojection;
  }

  /** The precomputed scattering tables. */
  get scattering() {
    return this.#scattering;
  }

  /**
   * The backdrop meshes this system added to the scene, in draw order.
   * Hosts can exclude these meshes from refraction sampling.
   */
  get backdrops() {
    // In draw order, which is the layer order: the opaque dome, then the
    // additive night sky over it, then the cloud layer. The night sky is only
    // in the list when it exists — a caller filtering its scene against this
    // array must not have to skip a null.
    return Object.freeze(this.#nightSky
      ? [this.#dome.group, this.#nightSky.group, this.#cloudLayer.mesh]
      : [this.#dome.group, this.#cloudLayer.mesh]);
  }

  /** World Y treated as ground, in metres. Moves the dome and the cloud shell together. */
  get groundLevel() {
    return this.#dome.groundLevel;
  }

  set groundLevel(value) {
    const next = finiteNumber(value);
    if (next === null) return;
    this.#dome.groundLevel = next;
    // Writes the cloud pass's uniform, which the reprojection shares by
    // reference, so all three intersect one shell.
    this.#cloud.groundLevel = next;
    this.#cloudShadow.groundReferenceY = next;
  }

  // -------------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------------

  /**
   * Applies a preset. Look only: it never touches the quality tier or the march
   * budgets. Applying one FULLY REPLACES sky state — anything the preset leaves
   * out falls back to the schema default, not to whatever was on screen.
   *
   * @param {object} preset a SkyParams object.
   * @returns {Promise<void>}
   */
  async applyPreset(preset) {
    this.#assertLive();
    // `createSkyParams(preset)` with no base is what makes this a replacement
    // rather than a merge, and it is also the fixed point `toParams()` returns:
    // clamps, folds and derived-value rules all run here, once.
    const params = createSkyParams(isObject(preset) ? preset : {});

    this.#atmosphere.applyParams(params.atmosphere);
    this.#skyColor.applyParams(params.atmosphere.style);
    this.#clouds.applyParams(params.cloud);
    this.#cloudStyle.applyParams(params.cloud.style);
    this.#godRays.applyParams(params.godRays);
    this.#nightSkyParams.intensity = clampToRange(
      NIGHT_SKY_PARAM_SCHEMA.intensity.range,
      params.nightSky.intensity,
      this.#nightSkyParams.intensity,
    );
    // Through applyParams, not the uniform, so the module that publishes the
    // range is the only thing that ever writes it.
    this.#nightSky?.applyParams({ intensity: this.#nightSkyParams.intensity });

    // The clock and the sun, in the one order that lets both survive.
    //
    // A running clock owns `sun.direction` — sunDriver.js re-solves it on every
    // tick and on every change of time/latitude/azimuth. So the authored pose is
    // landed with the rate held at 0: the driver adopts the preset's clock
    // reading without claiming the direction, the pose is written, a second
    // `apply()` derives the moon direction, the horizon fade, the night terms
    // and the star rotation FROM THAT POSE, and only then is the preset's rate
    // restored. `toParams()` therefore reads back the sun the preset authored,
    // and the next `update(dt)` with a running clock takes the direction back —
    // exactly what "0 pauses, which also frees sun.direction" implies.
    const rate = params.time.autoAdvanceSecondsPerDay;
    this.#timeOfDay.applyParams({ ...params.time, autoAdvanceSecondsPerDay: 0 });
    this.#sunDriver.apply();
    this.#sun.applyParams(params.sun);
    this.#sunDriver.apply();
    this.#timeOfDay.autoAdvanceSecondsPerDay = rate;

    // Last, because it regenerates textures on the CPU and is the only reason
    // this method is async. `noise.weather.resolution` is a params field a
    // preset may carry, which is why a preset can override the tier here.
    await this.#applyNoise(params.noise);
  }

  /**
   * Reads the current sky back as a SkyParams — the inverse of `applyPreset`.
   *
   * Colours and the weather profile are COPIED OUT, so later changes to the sky
   * do not reach the returned value. The quality tier, the march budgets and the
   * env-map bake config are not included; read the tier from `qualityLevel`.
   *
   * @returns {object} SkyParams
   */
  toParams() {
    return {
      // Every group's own toParams() already returns a fresh THREE.Color for
      // each colour field, so the copy is theirs and is not repeated here. The
      // weather profile has no owning group, so this method copies it.
      atmosphere: {
        ...this.#atmosphere.toParams(),
        style: this.#skyColor.toParams(),
      },
      cloud: {
        ...this.#clouds.toParams(),
        style: this.#cloudStyle.toParams(),
      },
      godRays: this.#godRays.toParams(),
      nightSky: { intensity: this.#nightSkyParams.intensity },
      noise: {
        weather: {
          resolution: this.#noise.weather.resolution,
          seed: this.#noise.weather.seed,
          profile: { ...this.#noise.weather.profile },
        },
      },
      sun: this.#sun.toParams(),
      time: this.#timeOfDay.toParams(),
    };
  }

  // -------------------------------------------------------------------------
  // Quality
  // -------------------------------------------------------------------------

  /**
   * Switches the runtime quality tier. Cost policy only: the only two SkyParams
   * fields a tier is allowed to move are the two the reference documents as
   * tier-driven — `godRays.enabled` and `noise.weather.resolution` — and it moves
   * them only when the TIER'S OWN value for them changed. Re-asserting a value
   * the outgoing tier already held would undo a preset's override for no reason:
   * high and ultra agree about both fields, so switching between them leaves
   * `toParams()` bit-identical. Nothing else in `toParams()` ever changes.
   *
   * @param {string} level tier name.
   * @param {object} [overrides] Partial<QualityLevelConfig>, merged field by field.
   * @returns {Promise<void>}
   */
  async setQualityLevel(level, overrides = {}) {
    this.#assertLive();
    const previous = this.#quality;
    this.#qualityName = resolveQualityLevelName(level);
    this.#qualityOverrides = isObject(overrides) ? { ...overrides } : {};
    this.#quality = resolveQuality(this.#qualityName, this.#qualityOverrides);

    // Not a params field — a pure tier uniform — so it is always written.
    this.#godRays.steps.value = this.#quality.godRaySteps;
    this.#cloudShadow.setResolution(this.#quality.cloudShadowResolution);
    this.#cloudShadow.mipLevel.value = this.#quality.cloudShadowMipLevel;
    if (this.#quality.godRaysEnabled !== previous.godRaysEnabled) {
      this.#godRays.enabled = this.#quality.godRaysEnabled;
    }

    if (this.#quality.cloudHistoryDiv !== previous.cloudHistoryDiv) {
      // `historyDiv` is fixed when the reconstruction is built — every target
      // size, the jitter cycle and the warmup length are derived from it — so a
      // change is a rebuild, which also drops the stale history.
      const { fullWidth, fullHeight } = this.#reprojection.size;
      this.#reprojection.dispose();
      this.#reprojection = this.#createReprojection(fullWidth, fullHeight);
      this.#cloudTextureNode.value = this.#reprojection.texture;
      this.#cloudHitTextureNode.value = this.#reprojection.hitDistanceTexture;
    }

    const dimsChanged = this.#quality.baseShapeDims.x !== previous.baseShapeDims.x
      || this.#quality.baseShapeDims.y !== previous.baseShapeDims.y
      || this.#quality.baseShapeDims.z !== previous.baseShapeDims.z;
    // Only when the tier's own opinion changed — see the doc comment. A preset
    // that overrode the resolution keeps it across a switch between two tiers
    // that agree about it.
    const weatherChanged = this.#quality.weatherMapResolution !== previous.weatherMapResolution;
    if (weatherChanged) this.#noise.weather.resolution = this.#quality.weatherMapResolution;
    if (dimsChanged || weatherChanged) {
      // Awaited so a host can gate on the regeneration finishing; the generators
      // are synchronous CPU work, so this yields once rather than polling.
      await Promise.resolve();
      this.#cloud.setVolumes(this.#resolveVolumes());
      this.#reprojection.reset();
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  /**
   * Per-frame tick: runs the cloud passes, advances the day/night clock, and
   * refreshes uniforms. Call it once per frame BEFORE rendering — the cloud
   * backdrop draws in the scene, so its image has to exist by the time the scene
   * pass runs.
   *
   * @param {number} dt seconds since the last frame.
   */
  update(dt = 0) {
    if (this.#disposed) return;
    const delta = Math.max(0, finiteNumber(dt) ?? 0);

    this.#sunDriver.update(delta);
    this.#clouds.update(delta);
    this.#dome.update(delta, this.#camera);
    // After the driver, because every celestial term in the night sky reads the
    // clock uniforms the driver just re-solved. The call itself only re-centres
    // the sphere on the camera, so the star field cannot be walked out of.
    this.#nightSky?.update(delta, this.#camera);
    this.#refreshCamera();

    const enabled = this.#clouds.enabled === true;
    this.#post.cloudsEnabled.value = enabled ? 1 : 0;
    this.#cloudLayer.mesh.visible = enabled;
    this.#cloudShadow.enabled = enabled && this.cloudShadowsEnabled;
    if (this.#cloudShadow.enabled) {
      // The shadow bake samples an explicit mip before the primary cloud pass
      // runs, so upload the authored 3D mip pyramid here as well as in the
      // reconstruction path. The helper is idempotent per renderer.
      this.#cloud.prepareNoiseMipmaps(this.#renderer);
      this.#cloudShadow.updateFrame(this.#camera);
      this.#cloudShadow.bake(this.#renderer);
    }
    syncEnvironmentCloudShadowPass(this.#cloudShadow);
    this.#godRayPass.update();
    if (enabled) {
      // The reconstruction marches the cloud pass itself and returns the texture
      // to composite; the target it wrote ping-pongs, so the backdrop's texture
      // node is re-pointed every frame. Both targets are allocated with
      // identical parameters, so this is a uniform change and not a recompile.
      this.#cloudTextureNode.value = this.#reprojection.render(this.#renderer, this.#camera);
      this.#cloudHitTextureNode.value = this.#reprojection.hitDistanceTexture;
    } else {
      // A disabled layer must warm up again when it comes back rather than
      // popping in a stale image — the reference's documented ~16 frames.
      this.#reprojection.reset();
    }
  }

  /**
   * Resizes the internal render targets and drops stale history.
   *
   * @param {number} width CSS (logical) pixels — the same units as
   *   `renderer.setSize()`. The renderer's pixel ratio is applied internally.
   * @param {number} height CSS (logical) pixels.
   */
  resize(width, height) {
    if (this.#disposed) return;
    const cssWidth = Math.max(1, finiteNumber(width) ?? this.#cssWidth);
    const cssHeight = Math.max(1, finiteNumber(height) ?? this.#cssHeight);
    this.#cssWidth = cssWidth;
    this.#cssHeight = cssHeight;
    const ratio = this.#renderer.getPixelRatio?.() ?? 1;
    this.#reprojection.setSize(
      Math.max(1, Math.round(cssWidth * ratio)),
      Math.max(1, Math.round(cssHeight * ratio)),
    );
    // setSize() only resets when the size actually changed, and this method is
    // also the documented hook for a pixel-ratio change at the same CSS size.
    this.#reprojection.reset();
    this.#cloudTextureNode.value = this.#reprojection.texture;
    this.#cloudHitTextureNode.value = this.#reprojection.hitDistanceTexture;
  }

  // -------------------------------------------------------------------------
  // Compositing
  // -------------------------------------------------------------------------

  /**
   * Composites the sky over the rendered scene: aerial-perspective fog, then god
   * rays. Splice the returned node into a post graph in linear pre-exposure
   * space — after the scene, before exposure and bloom.
   *
   * Clouds are not part of this. They draw in the scene with the rest of the
   * sky, so opaque geometry hides them and host transparency draws over them.
   *
   * @param {object} sceneColor Node<vec4> — the colour node being chained. Need
   *   not be `scenePass`'s own output.
   * @param {object} scenePass the `pass(scene, camera)` node; supplies the depth
   *   both stages composite against.
   * @returns {object} Node<vec4>
   */
  applyTo(sceneColor, scenePass) {
    this.#assertLive();
    if (!isNode(sceneColor)) {
      throw new TypeError('SkySystem.applyTo needs a colour node as its first argument.');
    }
    if (scenePass?.isPassNode !== true || typeof scenePass.getViewZNode !== 'function') {
      throw new TypeError(
        'SkySystem.applyTo needs the pass(scene, camera) node as its second argument — '
        + 'both stages read the scene depth from it.',
      );
    }

    const output = this.#fogNode(sceneColor, scenePass);
    const viewZ = scenePass.getViewZNode('depth');
    const ndc = vec2(screenUV.x.mul(2).sub(1), screenUV.y.mul(-2).add(1));
    const ray = this.#post.rayBasis.mul(vec3(ndc, 1));
    const viewDirection = normalize(ray);
    const sceneDistance = viewZ.negate().mul(length(ray));
    return this.#godRayPass.applyTo(output, viewDirection, sceneDistance);
  }

  /**
   * Cloud sun-transmittance at a world position, 0..1, where 1 is full sun.
   * Multiply it into the DIRECT sun term of a material, never into ambient.
   *
   * The value is one filtered lookup into the camera-centred top-down
   * transmittance bake. It fades to full light over the outer 20% of the 8 km
   * footprint and returns full light outside it.
   *
   * @param {object} worldPos Node<vec3> world-space position, e.g. positionWorld.
   * @returns {object} Node<float> in [0, 1].
   */
  cloudShadow(worldPos) {
    this.#assertLive();
    if (!isNode(worldPos)) {
      throw new TypeError('SkySystem.cloudShadow needs a Node<vec3> world position.');
    }

    return sampleCloudShadowNode(
      vec3(worldPos),
      this.#cloudShadowMapNode,
      this.#cloudShadow.projection,
    );
  }

  // -------------------------------------------------------------------------
  // Textures and lifetime
  // -------------------------------------------------------------------------

  /**
   * Sets or clears the cirrus-deck mask. `scale` and `strength` are live
   * uniforms on `clouds.cirrus`.
   *
   * @param {THREE.Texture|null} map the mask, or null to clear it.
   */
  setCirrusTexture(map) {
    this.#assertLive();
    this.#cloud.setCirrusTexture(map ?? null);
  }

  /**
   * Overrides the generated weather map with a host-authored coverage texture.
   *
   * The override is runtime state rather than SkyParams art direction. It is
   * retained across preset and quality changes until cleared with `null`, and
   * is never disposed by the SkySystem because the host owns the texture.
   * Hero-cloud authoring uses this path to preview a doodled footprint through
   * the same physical volume marcher as the normal cloud deck.
   *
   * @param {THREE.Texture|null} map linear RGBA coverage/type/precipitation map.
   */
  setCloudWeatherTexture(map) {
    this.#assertLive();
    if (map !== null && map !== undefined && map.isTexture !== true) {
      throw new TypeError('SkySystem.setCloudWeatherTexture needs a THREE.Texture or null.');
    }
    this.#cloudWeatherOverride = map ?? null;
    this.#cloud.setVolumes({ weather: this.#cloudWeatherOverride ?? this.#resolveGeneratedWeather() });
    this.#reprojection.reset();
  }

  /**
   * Builds a SkyEnvironment: a 2D equirectangular env map sharing this system's
   * atmosphere, sun, cloud state and noise textures.
   *
   * NOT IMPLEMENTED. The interface is `createEnvironmentMap(options)` where
   * options is a SkyEnvironmentOptions — `{ width, height, includeClouds,
   * cloudMarchSteps, cloudMipBase, origin, skipFrames }`, defaulting to
   * `DEFAULT_ENV_MAP_OPTIONS` from ./skyQualityTiers.js when built directly and
   * to the tier's `envMap*` fields when seeded from one. It throws rather than
   * returning a dead object, because a host cannot tell a frozen bake from a
   * black one.
   */
  createEnvironmentMap(options = {}) {
    this.#assertLive();
    void options;
    throw new Error(
      'SkySystem.createEnvironmentMap() is not implemented yet: the live equirect bake lands '
      + 'in src/sky/skyEnvironment.js, which has not been built. The tier already carries its '
      + 'sizing (envMapEnabled, envMapClouds, envMapWidth, envMapHeight, envMapMarchSteps, '
      + 'envMapMipBase) and ./skyQualityTiers.js publishes DEFAULT_ENV_MAP_OPTIONS for a bake '
      + 'built directly.',
    );
  }

  /**
   * Reserved sky-provider adapter for host render integrations.
   *
   * NOT IMPLEMENTED. The interface is `createSkyProvider({ envMap })` where
   * envMap is `false` (a clouds-free sky bake), `true` (an env map seeded from
   * the active tier), or a SkyEnvironmentOptions object. The returned provider
   * exposes `createFogSampler`, `createReflectionSampler`,
   * `followCamera`, `getEnvironmentTexture`, `getMeshes`, `getSun`, `setActive`
   * and `dispose`; `getMeshes` is already answerable from `backdrops` and
   * `getSun` from `sun`, but the two samplers need the env-map bake below.
   */
  createSkyProvider(options = {}) {
    this.#assertLive();
    void options;
    throw new Error(
      'SkySystem.createSkyProvider() is not implemented yet: it needs the env-map bake in '
      + 'src/sky/skyEnvironment.js, which has not been built. `backdrops` and `sun` already '
      + 'answer the provider\'s getMeshes() and getSun().',
    );
  }

  /** Releases GPU resources and removes the backdrops from the scene. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#cloudLayer.mesh.removeFromParent();
    this.#cloudLayer.mesh.geometry.dispose();
    this.#cloudLayer.material.dispose();
    this.#godRayPass.dispose();
    clearEnvironmentCloudShadowPass(this.#cloudShadow);
    this.#cloudShadow.dispose();
    this.#reprojection.dispose();
    this.#cloud.dispose();
    // Removes the dome group from the scene as well as freeing its geometry.
    this.#dome.dispose();
    // Same contract: its own dispose() detaches the group and frees the mesh.
    // Host panoramas survive it — the slot only disposes what ownership was
    // handed over for, which is the textures `create` loaded from a URL.
    this.#nightSky?.dispose();
    this.#scattering.dispose();

    // The noise volumes and weather maps are deliberately NOT disposed. They
    // live in module-level caches keyed by (dims, seed) and (resolution, seed,
    // profile), shared with every other SkySystem and every lab in the page, so
    // freeing them here would pull textures out from under a live sibling. Call
    // disposeCloudBaseShapeVolumes / disposeCloudErosionVolumes /
    // disposeCurlNoiseVolumes / disposeWeatherMaps to drop the caches when the
    // last consumer is gone.
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  #assertLive() {
    if (this.#disposed) throw new Error('This SkySystem has been disposed.');
  }

  /** The five noise textures for the current tier, seed and weather profile. */
  #resolveVolumes() {
    const { seed } = this.#noise.weather;
    return {
      baseShape: getCloudBaseShapeVolume({ dims: this.#quality.baseShapeDims, seed }),
      cirrus: getCloudCirrusMap({ seed }),
      curl: getCurlNoiseVolume({ seed }),
      erosion: getCloudErosionVolume({ seed }),
      weather: this.#cloudWeatherOverride ?? this.#resolveGeneratedWeather(),
    };
  }

  #resolveGeneratedWeather() {
    const { profile, resolution, seed } = this.#noise.weather;
    return getWeatherMap({ profile, resolution, seed });
  }

  /**
   * Applies the `noise` block, regenerating on the CPU only when something the
   * generators key on actually moved. A profile slider drag reaches here every
   * frame in the lab, and a 1024² FBM is not free.
   */
  async #applyNoise(noise) {
    const weather = noise?.weather ?? {};
    const profile = createWeatherMapProfile(weather.profile);
    const resolution = weather.resolution ?? this.#noise.weather.resolution;
    const seed = weather.seed ?? this.#noise.weather.seed;
    const changed = resolution !== this.#noise.weather.resolution
      || seed !== this.#noise.weather.seed
      || Object.keys(profile).some((key) => profile[key] !== this.#noise.weather.profile[key]);

    this.#noise.weather = { profile, resolution, seed };
    if (!changed) return;
    await Promise.resolve();
    this.#cloud.setVolumes(this.#resolveVolumes());
    // The reconstruction is holding an image of a cloud field that no longer
    // exists, and the neighbourhood clamp cannot police a change this large.
    this.#reprojection.reset();
  }

  #createReprojection(width, height) {
    return createCloudReprojection({
      cloudVolume: this.#cloud,
      fade: this.#clouds.fade,
      height,
      historyDiv: this.#quality.cloudHistoryDiv,
      shape: this.#clouds.shape,
      wind: this.#clouds.wind,
      width,
    });
  }

  /**
   * The cloud backdrop: the reconstructed cloud image, drawn in the scene.
   *
   * A camera-centred sphere, drawn from the inside, exactly like the dome — NOT
   * a clip-space quad written through `vertexNode`. The quad is the obvious
   * construction and it does not survive a `pass(scene, camera)`: measured on
   * both backends, a full-screen quad whose vertex node writes the far plane
   * drew 640/640 pixels of a direct `renderer.render()` and 0/640 of the same
   * frame through the pass, with byte-identical WGSL and no validation error, on
   * every combination of depth test, blending, side and geometry size tried. The
   * sphere renders in both, so the layer is built the way the dome already
   * proves works.
   *
   * The sphere's radius is what the depth test compares against, so
   * `#refreshCamera` keeps it beyond any geometry a host can plausibly draw while
   * staying inside the depth buffer's usable range — see CLOUD_LAYER_FAR_FRACTION
   * for the measurement that rules out the far plane itself. Anything nearer
   * occludes the cloud, which is what "hidden behind opaque geometry" has to mean.
   * `depthWrite: false` keeps the layer out of everyone else's depth test, and it
   * draws before host transparency, so glass and particles composite over it.
   *
   * Without a scene-depth input, occlusion is still based on the carrier.
   * setSceneDepthTexture opts into clipped integration and disables this
   * carrier depth test so cloud in front of opaque geometry can composite.
   *
   * Premultiplied over, not alpha blending: the marcher writes
   * `vec4(scatteredRadiance, viewTransmittance)`, and the composite the cloud
   * module documents is `sky * T + scattered`. With src.rgb = scattered and
   * src.a = 1 - T that is exactly One / OneMinusSrcAlpha, and no multiply of the
   * radiance by an alpha is needed or wanted — the radiance is already the
   * cloud's contribution to the pixel. A basic material emits
   * `vec4(diffuseColor.rgb, diffuseColor.a)` without premultiplying, so the pair
   * arrives at the blender as written.
   */
  #createCloudLayer() {
    const cloudTexture = this.#cloudTextureNode;

    const material = new MeshBasicNodeMaterial();
    material.name = 'ToonLabSkyCloudLayer';
    material.depthTest = true;
    material.depthWrite = false;
    material.transparent = true;
    material.toneMapped = false;
    material.fog = false;
    // Seen from the inside. BackSide rather than DoubleSide on purpose: three
    // renders a DoubleSide transparent material in two passes, which would march
    // the whole screen twice for nothing.
    material.side = THREE.BackSide;
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    // The image is screen-space, so the sphere is only a carrier for coverage and
    // depth; its tessellation and radius do not enter the shading at all.
    material.colorNode = Fn(() => {
      const image = cloudTexture.sample(screenUV).toVar();
      return vec4(max(image.rgb, vec3(0)), saturate(image.a.oneMinus()));
    })();

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
    mesh.name = 'ToonLabSkyCloudLayer';
    mesh.frustumCulled = false;
    placeInLayer(mesh, RenderLayer.backgroundOverlay);

    return { material, mesh };
  }

  /** Refreshes the camera-derived uniforms every stage reads. Allocation-free. */
  #refreshCamera() {
    const camera = this.#camera;
    camera.updateMatrixWorld();
    const world = camera.matrixWorld.elements;
    const projection = camera.projectionMatrix.elements;
    const tanX = projection[0] !== 0 ? 1 / projection[0] : 1;
    const tanY = projection[5] !== 0 ? 1 / projection[5] : 1;
    rightScratch.set(world[0], world[1], world[2]).normalize().multiplyScalar(tanX);
    upScratch.set(world[4], world[5], world[6]).normalize().multiplyScalar(tanY);
    forwardScratch.set(-world[8], -world[9], -world[10]).normalize();
    // Columns are right * tanX, up * tanY, forward — the same basis the marcher
    // and the reconstruction build, so every stage agrees where a pixel looks.
    // `dot(basis * vec3(ndc, 1), forward)` is 1 by construction, which is what
    // lets the fog turn a view-space depth into a distance along the ray with a
    // single length().
    this.#post.rayBasis.value.set(
      rightScratch.x, upScratch.x, forwardScratch.x,
      rightScratch.y, upScratch.y, forwardScratch.y,
      rightScratch.z, upScratch.z, forwardScratch.z,
    );
    this.#post.cameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
    this.#post.far.value = camera.far ?? this.#post.far.value;
    // The atmosphere carrier is created at a world-scale radius, but a normal
    // gameplay camera often has a far plane of only a few hundred units. Keep
    // the package-owned carrier inside that host frustum automatically; its
    // shader depends only on view direction, so this changes no atmosphere
    // math and prevents the clear colour from replacing the sky entirely.
    const far = Number.isFinite(camera.far) ? Math.max(camera.far, 1e-3) : 1;
    const near = Number.isFinite(camera.near) ? Math.max(camera.near, 0) : 0;
    const domeRadius = Math.min(far * 0.99, Math.max(far * 0.9, near * 1.01));
    if (this.#dome.mesh.scale.x !== domeRadius) {
      this.#dome.mesh.scale.setScalar(domeRadius);
      this.#dome.mesh.updateMatrix();
    }
    // The cloud backdrop rides with the camera, far enough out that its depth
    // beats anything a host is going to draw and near enough that the depth
    // buffer can still tell the two apart — see CLOUD_LAYER_FAR_FRACTION. The
    // depth test then decides on its own where cloud is hidden.
    const layer = this.#cloudLayer.mesh;
    layer.position.copy(this.#post.cameraPosition.value);
    layer.scale.setScalar(Math.min(
      far * CLOUD_LAYER_FAR_CAP,
      Math.max(
        far * CLOUD_LAYER_FAR_FRACTION,
        this.#clouds.fade.maxMarchDist.value * CLOUD_LAYER_MARCH_MARGIN,
      ),
    ));
    // Keeps the cloud pass's own camera uniforms current even on a frame where
    // the layer is disabled, because `cloudShadow()` reads that field from host
    // materials whether or not the clouds are on screen.
    this.#cloud.update(camera);
  }

  /**
   * Aerial-perspective fog: opaque geometry fades toward the sky radiance along
   * its own view direction, so a far ridge converges on the sky sitting directly
   * behind it rather than on a flat haze colour.
   *
   * The extinction is the real per-channel atmospheric extinction at the
   * camera's altitude, straight off the baked medium, which is why `fogDensity`
   * 1 half-fades near 23 km without a fitted constant anywhere: ln 2 divided by
   * a sea-level extinction around 0.03 1/km IS 23 km. Scaling that optical depth
   * is all the parameter does, so 0 switches the stage off exactly.
   *
   * The target radiance is the sky march WITHOUT the sun disc. A ridge has to
   * fade into the sky behind it, not into a disc three orders of magnitude
   * brighter that happens to be near the same bearing.
   *
   * Open sky is left alone, and clouds are never fogged, and both fall out of the
   * one depth test rather than needing a mask: the cloud backdrop writes no
   * depth, so a cloud pixel carries the depth of whatever opaque geometry stands
   * behind it, and a cloud that survived the backdrop's own depth test has
   * nothing behind it but the cleared far plane. The threshold that test uses is
   * the subtle part — see SKY_DEPTH_FRACTION.
   *
   * Moves to src/sky/skyFog.js when that module lands; nothing here is exported.
   */
  #fogNode(sceneColor, scenePass) {
    const viewZ = scenePass.getViewZNode('depth');
    const atmosphere = this.#atmosphere;
    const skyColor = this.#skyColor;
    const scattering = this.#scattering;
    const sun = this.#sun;
    const post = this.#post;
    const groundLevel = this.#dome.uniforms.groundLevel;

    return Fn(() => {
      const source = vec4(sceneColor).toVar();
      const rgb = source.rgb.toVar();
      // screenUV is top-left origin on both backends, so NDC y is 1 - 2v.
      const ndc = vec2(screenUV.x.mul(2).sub(1), screenUV.y.mul(-2).add(1)).toVar();
      const ray = post.rayBasis.mul(vec3(ndc, 1)).toVar();
      const viewDir = normalize(ray).toVar();
      // viewZ is negative in view space; the basis above makes the forward
      // component exactly 1, so the distance along the ray is the forward
      // distance times the ray's length.
      const forwardDistance = viewZ.negate().toVar();
      const distance = forwardDistance.mul(length(ray)).toVar();

      // Geometry only. Sky pixels skip the march entirely rather than paying for
      // a target they then mix by zero.
      If(forwardDistance.lessThan(post.far.mul(SKY_DEPTH_FRACTION)), () => {
        const cameraAltitude = max(post.cameraPosition.y.sub(groundLevel), 1).toVar();
        const cameraKm = cameraAltitude.mul(0.001).toVar();
        const air = scattering.mediumNodes(cameraKm);
        const opticalDepth = air.extinction
          .mul(distance.mul(0.001))
          .mul(max(atmosphere.fogDensity, 0))
          .toVar();
        const transmittance = exp(opticalDepth.negate()).toVar();

        const skyTarget = applySkyColorNode(atmosphereRaymarchNodes({
          groundAlbedo: atmosphere.groundAlbedo,
          mieDirectionalG: atmosphere.mieDirectionalG,
          mieScatteringStrength: atmosphere.mieScatteringStrength,
          scattering,
          skyMultipleScattering: atmosphere.skyMultipleScattering,
          steps: FOG_SKY_MARCH_STEPS,
          sunDir: normalize(sun.direction),
          sunIrradiance: sun.color.mul(sun.intensity),
          viewDir,
          viewHeightKm: cameraKm,
        }).luminance, viewDir, skyColor, this.#timeOfDay).toVar();

        // The far band replaces geometry with sky outright, which is what hides
        // the rim of a finite world. Kept strictly ordered so the smoothstep
        // cannot divide by zero.
        const farFade = smoothstep(
          atmosphere.fogFarFadeStart,
          max(atmosphere.fogFarFadeEnd, atmosphere.fogFarFadeStart.add(1)),
          distance,
        ).toVar();
        // The cloud march already applies aerial perspective at cloud depth.
        // Fog only the opaque contribution behind it, preserving its radiance.
        If(this.#cloud.uniforms.sceneDepthEnabled.greaterThan(0.5)
          .and(this.#post.cloudsEnabled.greaterThan(0.5)), () => {
          const cloud = this.#cloudTextureNode.sample(screenUV);
          skyTarget.assign(skyTarget.mul(cloud.a).add(cloud.rgb));
        });
        rgb.assign(mix(mix(skyTarget, rgb, transmittance), skyTarget, farFade));
      });

      return vec4(max(rgb, vec3(0)), source.a);
    })();
  }
}

/**
 * Convenience factory, matching this package's `createX` naming. Identical to
 * {@link SkySystem.create}.
 */
export function createSkySystem(options = {}) {
  return SkySystem.create(options);
}
