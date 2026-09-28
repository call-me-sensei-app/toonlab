import * as THREE from 'three';
import { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js';
import {
  Fn,
  cameraPosition,
  clamp,
  dot,
  floor,
  fract,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  createSkyShaderSettings,
} from './skyShaderSettings.js';
import {
  celestialDirectionForHour,
  createSkyAtmosphereSettings,
  createSkyTimeKeyframes,
  sampleSkyTimeKeyframes,
} from './skyTimeKeyframes.js';

function setColor(node, value) {
  const channels = Array.isArray(value) ? value : [1, 1, 1];
  node.value.setRGB(channels[0], channels[1], channels[2]);
}

function daylightForHour(hour) {
  const direction = celestialDirectionForHour(hour);
  return THREE.MathUtils.smoothstep(direction[1], -0.08, 0.12);
}

/**
 * Three.js Preetham atmosphere with ToonLab's authored grading and graphic
 * celestial overlay. The stock SkyMesh cloud layer is disabled; dedicated
 * CloudField assets own clouds.
 */
export class AtmosphereSky extends THREE.Group {
  constructor({
    atmosphere,
    hour = 13,
    radius = 10_000,
    settings,
    timeKeyframes,
  } = {}) {
    super();
    this.name = 'ToonLabAtmosphereSky';
    this.frustumCulled = false;
    this._hour = Number(hour) || 0;
    this._profile = {
      atmosphere: createSkyAtmosphereSettings(atmosphere),
      settings: createSkyShaderSettings(settings),
      timeKeyframes: createSkyTimeKeyframes(timeKeyframes),
    };
    this._sceneLayers = new Map();
    this._renderedSettings = {};

    const sky = new SkyMesh();
    sky.name = 'ToonLabPreethamAtmosphere';
    sky.scale.setScalar(radius);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.cloudCoverage.value = 0;
    sky.cloudDensity.value = 0;
    sky.showSunDisc.value = 0;
    // The atmosphere supplies the scene fog color; it must not itself be
    // replaced by distance fog at the radius of the dome.
    sky.material.fog = false;
    this.skyMesh = sky;
    this.add(sky);

    const baseColorNode = sky.material.colorNode;
    const uniforms = {
      belowHorizonTint: uniform(new THREE.Color(1, 1, 1)),
      contrast: uniform(1),
      exposure: uniform(1),
      horizonGlow: uniform(0),
      horizonGlowColor: uniform(new THREE.Color(1, 0.8, 0.5)),
      horizonTint: uniform(new THREE.Color(1, 1, 1)),
      moonColor: uniform(new THREE.Color(0.76, 0.86, 1)),
      moonDirection: uniform(new THREE.Vector3(0, 1, 0)),
      moonDiscCos: uniform(Math.cos(0.022)),
      moonGlowStrength: uniform(0.32),
      nightStrength: uniform(0),
      saturation: uniform(1),
      starsColor: uniform(new THREE.Color(0.82, 0.9, 1)),
      starsDensity: uniform(0.34),
      starsScale: uniform(18),
      starsSeed: uniform(173),
      starsSize: uniform(0.045),
      starsStrength: uniform(1),
      starsTwinkleSpeed: uniform(0.8),
      starsTwinkleStrength: uniform(0.35),
      sunColor: uniform(new THREE.Color(1, 0.96, 0.86)),
      sunDirection: uniform(new THREE.Vector3(0, 1, 0)),
      sunDiscCos: uniform(Math.cos(0.026)),
      sunDiscIntensity: uniform(1.8),
      sunGlowStrength: uniform(0.45),
      zenithTint: uniform(new THREE.Color(1, 1, 1)),
    };
    this.uniforms = uniforms;

    sky.material.colorNode = Fn(() => {
      const direction = normalize(positionWorld.sub(cameraPosition)).toVar();
      const up = direction.y.toVar();
      // Anime open-world skies establish their blue much closer to the
      // horizon than a purely physical gradient; otherwise an elevated
      // gameplay camera sees only the pale horizon band.
      const zenithWeight = smoothstep(-0.02, 0.08, up).toVar();
      const belowWeight = smoothstep(0.02, 0.72, up.negate()).toVar();
      const horizonWeight = max(0, zenithWeight.add(belowWeight).oneMinus()).toVar();
      const regionTint = uniforms.horizonTint.mul(horizonWeight)
        .add(uniforms.zenithTint.mul(zenithWeight))
        .add(uniforms.belowHorizonTint.mul(belowWeight));
      // SkyMesh is an HDR scattering result. Multiplying an art-directable
      // tint into that raw range causes ACES to drive every channel toward
      // white. Compress the scattering first, then use it as the physical
      // variation beneath the authored color curve.
      const scattering = baseColorNode.rgb.div(baseColorNode.rgb.add(vec3(1)));
      const color = mix(scattering, regionTint, 0.92).toVar();

      const luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color.assign(mix(vec3(luminance), color, uniforms.saturation));
      color.assign(color.sub(0.5).mul(uniforms.contrast).add(0.5));
      color.mulAssign(uniforms.exposure);

      const sunDot = dot(direction, uniforms.sunDirection).toVar();
      const sunDisc = smoothstep(
        uniforms.sunDiscCos,
        uniforms.sunDiscCos.add(0.00012),
        sunDot,
      );
      const sunGlow = pow(max(sunDot, 0), 18).mul(uniforms.sunGlowStrength);
      color.addAssign(
        uniforms.sunColor.mul(
          sunDisc.mul(uniforms.sunDiscIntensity).add(sunGlow),
        ),
      );

      const moonDot = dot(direction, uniforms.moonDirection).toVar();
      const moonDisc = smoothstep(
        uniforms.moonDiscCos,
        uniforms.moonDiscCos.add(0.00012),
        moonDot,
      ).mul(uniforms.nightStrength);
      const moonGlow = pow(max(moonDot, 0), 28)
        .mul(uniforms.moonGlowStrength)
        .mul(uniforms.nightStrength);
      color.addAssign(uniforms.moonColor.mul(moonDisc.add(moonGlow)));

      const starUv = direction.xz
        .div(max(direction.y, 0.08))
        .mul(uniforms.starsScale);
      const cell = floor(starUv);
      const local = fract(starUv).sub(vec2(0.5));
      const random = fract(
        sin(dot(cell, vec2(12.9898, 78.233)).add(uniforms.starsSeed))
          .mul(43758.5453),
      );
      const candidate = smoothstep(
        uniforms.starsDensity.oneMinus(),
        1,
        random,
      );
      const starDistance = dot(local, local);
      const starCore = smoothstep(
        uniforms.starsSize.mul(uniforms.starsSize),
        uniforms.starsSize.mul(uniforms.starsSize).mul(0.18),
        starDistance,
      );
      const twinkle = mix(
        1,
        sin(time.mul(uniforms.starsTwinkleSpeed).add(random.mul(12.0)))
          .mul(0.5).add(0.5),
        uniforms.starsTwinkleStrength,
      );
      const starVisibility = smoothstep(0.01, 0.16, up)
        .mul(uniforms.nightStrength)
        .mul(uniforms.starsStrength);
      color.addAssign(
        uniforms.starsColor
          .mul(candidate)
          .mul(starCore)
          .mul(twinkle)
          .mul(starVisibility),
      );

      const horizonBand = smoothstep(0.28, 0, up.abs());
      const sunward = pow(clamp(sunDot.mul(0.5).add(0.5), 0, 1), 4);
      color.addAssign(
        uniforms.horizonGlowColor
          .mul(horizonBand)
          .mul(sunward)
          .mul(uniforms.horizonGlow),
      );
      return vec4(max(color, vec3(0)), 1);
    })();
    sky.material.needsUpdate = true;

    this.applySkyShaderProfile(this._profile);
    this.setTime(this._hour);
  }

  get hour() {
    return this._hour;
  }

  get profile() {
    return {
      atmosphere: { ...this._profile.atmosphere },
      settings: { ...this._profile.settings },
      timeKeyframes: this._profile.timeKeyframes.map((keyframe) => ({ ...keyframe })),
    };
  }

  get settings() {
    return {
      ...this._profile.settings,
      horizonColor: [...(this._renderedSettings.horizonColor ?? [0.78, 0.92, 1])],
      sunColor: [...this._profile.settings.sunColor],
      sunDirection: [...(this._renderedSettings.sunDirection ?? [0.35, 0.8, 0.45])],
      zenithColor: [...(this._renderedSettings.zenithColor ?? [0.28, 0.56, 0.92])],
    };
  }

  get renderedSettings() {
    return { ...this._renderedSettings };
  }

  applySkyShaderProfile(profile = {}) {
    this._profile = {
      atmosphere: createSkyAtmosphereSettings(profile.atmosphere ?? this._profile.atmosphere),
      settings: createSkyShaderSettings(profile.settings ?? this._profile.settings),
      timeKeyframes: createSkyTimeKeyframes(profile.timeKeyframes ?? this._profile.timeKeyframes),
    };
    const { atmosphere, settings } = this._profile;
    this.skyMesh.turbidity.value = atmosphere.turbidity;
    this.skyMesh.rayleigh.value = atmosphere.rayleigh;
    this.skyMesh.mieCoefficient.value = atmosphere.mieCoefficient;
    this.skyMesh.mieDirectionalG.value = atmosphere.mieDirectionalG;
    setColor(this.uniforms.sunColor, settings.sunColor);
    this.uniforms.sunDiscCos.value = Math.cos(settings.sunDiscSize);
    this.uniforms.sunDiscIntensity.value = settings.sunDiscIntensity;
    this.uniforms.sunGlowStrength.value = settings.sunGlowStrength;
    setColor(this.uniforms.moonColor, settings.moonColor);
    this.uniforms.moonDiscCos.value = Math.cos(settings.moonDiscSize);
    this.uniforms.moonGlowStrength.value = settings.moonGlowStrength;
    setColor(this.uniforms.starsColor, settings.starsColor);
    this.uniforms.starsDensity.value = settings.starsDensity;
    this.uniforms.starsScale.value = settings.starsScale;
    this.uniforms.starsSeed.value = settings.starsSeed;
    this.uniforms.starsSize.value = settings.starsSize;
    this.uniforms.starsStrength.value = settings.starsStrength;
    this.uniforms.starsTwinkleSpeed.value = settings.starsTwinkleSpeed;
    this.uniforms.starsTwinkleStrength.value = settings.starsTwinkleStrength;
    this.setTime(this._hour);
    return this.profile;
  }

  applySkyShaderSettings(settings = {}) {
    return this.applySkyShaderProfile({ ...this._profile, settings });
  }

  applySettings(options = {}) {
    if (options?.type === 'toonlab/sky-shader-preset'
      || options.atmosphere || options.timeKeyframes) {
      return this.applySkyShaderProfile(options);
    }
    this._profile.settings = createSkyShaderSettings({
      ...this._profile.settings,
      ...options,
      ...(options.sunSize === undefined ? {} : { sunDiscSize: options.sunSize }),
      ...(options.sunDiscIntensity === undefined ? {} : {
        sunDiscIntensity: options.sunDiscIntensity,
      }),
    });
    this.applySkyShaderProfile(this._profile);
    return this.settings;
  }

  setSceneOverrideLayer(id, settings = {}, { priority = 0 } = {}) {
    this._sceneLayers.set(String(id), { priority: Number(priority) || 0, settings: { ...settings } });
    this.setTime(this._hour);
    return this.renderedSettings;
  }

  clearSceneOverrideLayer(id) {
    this._sceneLayers.delete(String(id));
    this.setTime(this._hour);
  }

  clearAllSceneOverrideLayers() {
    this._sceneLayers.clear();
    this.setTime(this._hour);
  }

  setSceneOverrides(settings = {}) {
    return this.setSceneOverrideLayer('scene', settings);
  }

  clearSceneOverrides() {
    this.clearSceneOverrideLayer('scene');
  }

  setTime(hour) {
    this._hour = ((Number(hour) % 24) + 24) % 24;
    const grade = sampleSkyTimeKeyframes(this._profile.timeKeyframes, this._hour);
    const sunDirection = celestialDirectionForHour(this._hour);
    const moonDirection = celestialDirectionForHour(this._hour, { moon: true });
    this.skyMesh.sunPosition.value.fromArray(sunDirection).multiplyScalar(450_000);
    this.uniforms.sunDirection.value.fromArray(sunDirection).normalize();
    this.uniforms.moonDirection.value.fromArray(moonDirection).normalize();
    setColor(this.uniforms.zenithTint, grade.zenithTint);
    setColor(this.uniforms.horizonTint, grade.horizonTint);
    setColor(this.uniforms.belowHorizonTint, grade.belowHorizonTint);
    setColor(this.uniforms.horizonGlowColor, grade.horizonGlowColor);
    this.uniforms.saturation.value = grade.saturation;
    this.uniforms.contrast.value = grade.contrast;
    this.uniforms.exposure.value = grade.exposure;
    this.uniforms.horizonGlow.value = grade.horizonGlow;
    this.uniforms.nightStrength.value = 1 - daylightForHour(this._hour);
    const rendered = {
      horizonColor: [...grade.horizonTint],
      starsStrength: this._profile.settings.starsStrength,
      sunColor: [...this._profile.settings.sunColor],
      sunDirection: [...sunDirection],
      zenithColor: [...grade.zenithTint],
    };
    const layers = Array.from(this._sceneLayers.values())
      .sort((a, b) => a.priority - b.priority);
    for (const layer of layers) Object.assign(rendered, layer.settings);
    if (Array.isArray(rendered.sunDirection)) {
      this.skyMesh.sunPosition.value.fromArray(rendered.sunDirection).normalize().multiplyScalar(450_000);
      this.uniforms.sunDirection.value.fromArray(rendered.sunDirection).normalize();
    }
    if (Array.isArray(rendered.sunColor)) setColor(this.uniforms.sunColor, rendered.sunColor);
    if (Number.isFinite(Number(rendered.starsStrength))) {
      this.uniforms.starsStrength.value = Number(rendered.starsStrength);
    }
    if (Array.isArray(rendered.zenithColor)) setColor(this.uniforms.zenithTint, rendered.zenithColor);
    if (Array.isArray(rendered.horizonColor)) setColor(this.uniforms.horizonTint, rendered.horizonColor);
    this._renderedSettings = rendered;
    return {
      grade,
      hour: this._hour,
      moonDirection,
      sunDirection,
    };
  }

  update(_delta, camera) {
    if (camera?.position) this.position.copy(camera.position);
  }

  dispose() {
    this.skyMesh.geometry.dispose();
    this.skyMesh.material.dispose();
    this.removeFromParent();
  }
}
