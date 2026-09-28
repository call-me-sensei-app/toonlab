// ToonLab rain-field renderer. Atmospheric conditions provide world state;
// this renderer owns drop motion, appearance, and collision splashes.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cos,
  Discard,
  float,
  Fn,
  fract,
  length,
  max,
  mix,
  mod,
  normalize,
  positionGeometry,
  sin,
  smoothstep,
  sqrt,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export const TOONLAB_RAIN_FIELD_PROFILE = Object.freeze({
  drops: Object.freeze({
    cameraForwardOffsetMeters: 10,
    cameraVerticalOffsetMeters: 8,
    cameraFadeLengthMeters: 20,
    cameraFadeOffsetMeters: 0.1,
    cylinderHeightMeters: 1,
    cylinderRadiusMeters: 12,
    drag: 0.25,
    lengthMeters: Object.freeze([0.5, 0.8]),
    lifetimeSeconds: 2,
    lateralVelocityMetersPerSecond: Object.freeze([-1, 1]),
    overcastBrightnessMultiplier: 0.6,
    rateMaximumPerSecond: 500,
    velocityMetersPerSecond: Object.freeze([30, 40]),
    widthMeters: Object.freeze([0.03, 0.04]),
    windCurlFrequency: 0.5,
    windCurlScale: 2,
  }),
  splashes: Object.freeze({
    lifetimeSeconds: Object.freeze([0.15, 0.3]),
    receivesDropCollisionEvents: true,
  }),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededQuadGeometry(capacity, attributeName, seed) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('uv', quad.attributes.uv);
  const seeds = new Float32Array(capacity * 4);
  const random = mulberry32(seed);
  for (let index = 0; index < seeds.length; index += 1) {
    seeds[index] = random();
  }
  geometry.setAttribute(
    attributeName,
    new THREE.InstancedBufferAttribute(seeds, 4),
  );
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  quad.dispose();
  return geometry;
}

export function createRainDropMaterial() {
  const source = TOONLAB_RAIN_FIELD_PROFILE.drops;
  const uniforms = {
    uCenter: uniform(new THREE.Vector3()),
    uColor: uniform(new THREE.Color(0.701102, 0.947307, 1)),
    uFloorY: uniform(0),
    uHeight: uniform(source.cylinderHeightMeters),
    uLengthMaximum: uniform(source.lengthMeters[1]),
    uLengthMinimum: uniform(source.lengthMeters[0]),
    uOpacity: uniform(0.7),
    uOvercast: uniform(0),
    uPointScale: uniform(540),
    uRadius: uniform(source.cylinderRadiusMeters),
    uSpeedMaximum: uniform(source.velocityMetersPerSecond[1]),
    uSpeedMinimum: uniform(source.velocityMetersPerSecond[0]),
    uTime: uniform(0),
    uWidthMaximum: uniform(source.widthMeters[1]),
    uWidthMinimum: uniform(source.widthMeters[0]),
    uWind: uniform(new THREE.Vector2()),
  };

  const material = new NodeMaterial();
  material.name = 'ToonLab rain drop';
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;

  const vDropFade = varying(float(), 'vToonLabRainDropFade');
  const vDropSeed = varying(float(), 'vToonLabRainDropSeed');

  material.vertexNode = Fn(() => {
    const seed = attribute('aToonLabRainSeed', 'vec4');
    const angle = seed.x.mul(Math.PI * 2).toVar();
    const radialDistance = sqrt(seed.y)
      .mul(uniforms.uRadius)
      .toVar();
    const radialOffset = vec2(cos(angle), sin(angle))
      .mul(radialDistance)
      .toVar();

    const speed = mix(
      uniforms.uSpeedMinimum,
      uniforms.uSpeedMaximum,
      seed.w,
    ).toVar();
    const age = mod(
      uniforms.uTime.add(seed.z.mul(source.lifetimeSeconds)),
      source.lifetimeSeconds,
    ).toVar();
    const lateralSeed = vec2(
      fract(seed.x.mul(17.17)).mul(2).sub(1),
      fract(seed.y.mul(29.31)).mul(2).sub(1),
    );
    const curlPhase = uniforms.uTime
      .mul(source.windCurlFrequency)
      .add(seed.z.mul(Math.PI * 2))
      .toVar();
    const curlVelocity = vec2(
      sin(curlPhase),
      cos(curlPhase.mul(0.83).add(1.7)),
    ).mul(source.windCurlScale * 0.12);
    const lateralVelocity = lateralSeed
      .add(uniforms.uWind)
      .add(curlVelocity)
      .toVar();
    const spawnHeight = uniforms.uCenter.y
      .add(seed.y.sub(0.5).mul(uniforms.uHeight));
    const worldPosition = vec3(
      uniforms.uCenter.x.add(radialOffset.x).add(lateralVelocity.x.mul(age)),
      spawnHeight.sub(speed.mul(age)),
      uniforms.uCenter.z.add(radialOffset.y).add(lateralVelocity.y.mul(age)),
    ).toVar();
    const worldVelocity = vec3(lateralVelocity.x, speed.negate(), lateralVelocity.y);
    const viewVelocity = cameraViewMatrix
      .mul(vec4(worldVelocity, 0))
      .xy
      .toVar();
    const along = normalize(viewVelocity).toVar();
    const across = vec2(along.y.negate(), along.x).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1)).toVar();
    const depth = max(mvPosition.z.negate(), 0.2).toVar();
    const widthPixels = mix(
      uniforms.uWidthMinimum,
      uniforms.uWidthMaximum,
      fract(seed.w.mul(13.7)),
    ).mul(uniforms.uPointScale).div(depth);
    const lengthPixels = mix(
      uniforms.uLengthMinimum,
      uniforms.uLengthMaximum,
      fract(seed.z.mul(23.9)),
    ).mul(uniforms.uPointScale).div(depth);
    const pixelOffset = across
      .mul(positionGeometry.x.mul(widthPixels))
      .add(along.mul(positionGeometry.y.mul(lengthPixels)));
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      pixelOffset.mul(float(2).div(viewportSize)).mul(clipPosition.w),
    );

    const cameraDistance = length(worldPosition.sub(cameraPosition));
    const cameraFade = smoothstep(
      source.cameraFadeOffsetMeters,
      source.cameraFadeLengthMeters,
      cameraDistance,
    );
    const floorFade = smoothstep(
      uniforms.uFloorY,
      uniforms.uFloorY.add(0.2),
      worldPosition.y,
    );
    const lifeFade = smoothstep(0, 0.025, age)
      .mul(smoothstep(
        source.lifetimeSeconds - 0.08,
        source.lifetimeSeconds,
        age,
      ).oneMinus());
    // The physical streak may be large close to the camera, but the source
    // field suppresses that near-camera slab. Squaring the authored fade
    // keeps foreground drops from turning into screen-spanning white bars.
    vDropFade.assign(
      cameraFade.mul(cameraFade).mul(floorFade).mul(lifeFade),
    );
    vDropSeed.assign(seed.w);
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const point = uv().mul(2).sub(1).toVar();
    const body = smoothstep(1, 0.58, abs(point.x))
      .mul(smoothstep(1, 0.7, abs(point.y)));
    const centerHighlight = smoothstep(0.8, 0.05, abs(point.x));
    const overcastBrightness = mix(
      1,
      source.overcastBrightnessMultiplier,
      uniforms.uOvercast,
    );
    const alpha = body
      .mul(mix(0.72, 1, centerHighlight))
      .mul(uniforms.uOpacity)
      .mul(overcastBrightness)
      .mul(vDropFade)
      .mul(mix(0.78, 1, vDropSeed))
      .toVar();
    Discard(alpha.lessThan(0.012));
    return vec4(uniforms.uColor.mul(overcastBrightness), alpha);
  })();

  material.uniforms = uniforms;
  material.userData.isToonNodeMaterial = true;
  return material;
}

export function createRainSplashMaterial() {
  const uniforms = {
    uCenter: uniform(new THREE.Vector3()),
    uColor: uniform(new THREE.Color(0.701102, 0.947307, 1)),
    uOpacity: uniform(0.7),
    uPointScale: uniform(540),
    uRadius: uniform(TOONLAB_RAIN_FIELD_PROFILE.drops.cylinderRadiusMeters),
    uTime: uniform(0),
  };

  const material = new NodeMaterial();
  material.name = 'ToonLab rain splash';
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;

  const vSplashLife = varying(float(), 'vToonLabRainSplashLife');
  const vSplashSeed = varying(float(), 'vToonLabRainSplashSeed');

  material.vertexNode = Fn(() => {
    const seed = attribute('aToonLabRainSplashSeed', 'vec4');
    const source = TOONLAB_RAIN_FIELD_PROFILE.splashes;
    const lifetime = mix(
      source.lifetimeSeconds[0],
      source.lifetimeSeconds[1],
      seed.w,
    ).toVar();
    const age = mod(uniforms.uTime.add(seed.z.mul(lifetime)), lifetime).toVar();
    const life = age.div(lifetime).toVar();
    const angle = seed.x.mul(Math.PI * 2).toVar();
    const radialDistance = sqrt(seed.y).mul(uniforms.uRadius.mul(0.92)).toVar();
    const worldPosition = uniforms.uCenter.add(vec3(
      cos(angle).mul(radialDistance),
      0.13,
      sin(angle).mul(radialDistance),
    )).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1)).toVar();
    const depth = max(mvPosition.z.negate(), 0.2).toVar();
    const growth = smoothstep(0, 0.32, life);
    const widthPixels = mix(0.12, 0.42, seed.w)
      .mul(mix(0.55, 1, growth))
      .mul(uniforms.uPointScale)
      .div(depth);
    const heightPixels = mix(0.1, 0.28, seed.w)
      .mul(mix(0.5, 1, growth))
      .mul(uniforms.uPointScale)
      .div(depth);
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      vec2(
        positionGeometry.x.mul(widthPixels),
        positionGeometry.y.mul(heightPixels),
      ).mul(float(2).div(viewportSize)).mul(clipPosition.w),
    );
    vSplashLife.assign(life);
    vSplashSeed.assign(seed.w);
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const point = uv().mul(2).sub(1).toVar();
    const ellipsePoint = vec2(point.x, point.y.add(0.48).mul(2.4));
    const ringDistance = abs(length(ellipsePoint).sub(0.62));
    const ring = smoothstep(0.16, 0.035, ringDistance);
    const leftSpray = smoothstep(
      0.18,
      0.045,
      abs(point.x.add(point.y.mul(0.62)).add(0.08)),
    ).mul(smoothstep(-0.25, 0.55, point.y));
    const rightSpray = smoothstep(
      0.18,
      0.045,
      abs(point.x.sub(point.y.mul(0.62)).sub(0.08)),
    ).mul(smoothstep(-0.25, 0.55, point.y));
    const centerSpray = smoothstep(0.13, 0.035, abs(point.x))
      .mul(smoothstep(-0.35, 0.68, point.y));
    const shape = max(ring, max(leftSpray, max(rightSpray, centerSpray)));
    const fade = smoothstep(0, 0.08, vSplashLife)
      .mul(smoothstep(0.38, 1, vSplashLife).oneMinus());
    const alpha = shape
      .mul(fade)
      .mul(uniforms.uOpacity)
      .mul(mix(0.65, 1, vSplashSeed))
      .toVar();
    Discard(alpha.lessThan(0.012));
    return vec4(uniforms.uColor, alpha);
  })();

  material.uniforms = uniforms;
  material.userData.isToonNodeMaterial = true;
  return material;
}

export class RainFieldRenderer extends THREE.Group {
  constructor({
    maxRate = TOONLAB_RAIN_FIELD_PROFILE.drops.rateMaximumPerSecond,
    seed = 0x51a7e,
  } = {}) {
    super();
    this.name = 'ToonLab rain field';
    this.maxRate = Math.max(1, Number(maxRate) || 1);
    this.enabled = true;
    this.elapsed = 0;
    this.floorY = 0;
    this.emissionRate = 0;
    this.cameraPosition = new THREE.Vector3();
    this.cameraDirection = new THREE.Vector3();
    this.spawnCenter = new THREE.Vector3();
    this.renderSize = new THREE.Vector2();

    const dropCapacity = Math.ceil(
      this.maxRate * TOONLAB_RAIN_FIELD_PROFILE.drops.lifetimeSeconds,
    );
    this.drops = new THREE.Mesh(
      createSeededQuadGeometry(
        dropCapacity,
        'aToonLabRainSeed',
        seed,
      ),
      createRainDropMaterial(),
    );
    this.drops.name = 'ToonLab rain drops';
    this.drops.capacity = dropCapacity;
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 60;
    this.drops.userData.environmentShaderExclude = true;
    this.drops.userData.waterExclude = true;

    const splashCapacity = Math.max(32, Math.ceil(this.maxRate * 0.2));
    this.splashes = new THREE.Mesh(
      createSeededQuadGeometry(
        splashCapacity,
        'aToonLabRainSplashSeed',
        seed ^ 0x9e3779b9,
      ),
      createRainSplashMaterial(),
    );
    this.splashes.name = 'ToonLab rain collision splashes';
    this.splashes.capacity = splashCapacity;
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 61;
    this.splashes.userData.environmentShaderExclude = true;
    this.splashes.userData.waterExclude = true;

    this.add(this.drops, this.splashes);
    this.applyFrame(null);
  }

  applyFrame(frame) {
    const rain = frame?.precipitation?.rain;
    const emissionRate = Math.max(
      0,
      Number(frame?.precipitation?.emission?.rain) || 0,
    );
    const tint = Array.isArray(rain?.tint)
      ? rain.tint
      : [0.701102, 0.947307, 1, 0.7];
    const areaSize = Math.max(
      4,
      Number(rain?.areaSize)
        || TOONLAB_RAIN_FIELD_PROFILE.drops.cylinderRadiusMeters * 2,
    );
    const speed = Math.max(
      0.5,
      Number(rain?.speed)
        || TOONLAB_RAIN_FIELD_PROFILE.drops.velocityMetersPerSecond[0],
    );
    const streakLength = Math.max(
      0.05,
      Number(rain?.streakLength)
        || TOONLAB_RAIN_FIELD_PROFILE.drops.lengthMeters[0],
    );
    const direction = THREE.MathUtils.degToRad(
      Number(frame?.flow?.directionDegrees) || 0,
    );
    const windSpeed = Math.max(
      0,
      (
        (Number(frame?.flow?.minimum) || 0)
        + (Number(frame?.flow?.maximum) || 0)
      ) * 0.5,
    );
    const windScale = windSpeed * 0.12;
    const dropUniforms = this.drops.material.uniforms;
    const splashUniforms = this.splashes.material.uniforms;

    this.emissionRate = Math.min(this.maxRate, emissionRate);
    dropUniforms.uColor.value.setRGB(
      Number(tint[0]) || 0,
      Number(tint[1]) || 0,
      Number(tint[2]) || 0,
      THREE.SRGBColorSpace,
    );
    dropUniforms.uOpacity.value = clamp01(tint[3] ?? 0.7);
    dropUniforms.uOvercast.value = clamp01(frame?.ceiling?.amount);
    dropUniforms.uRadius.value = areaSize * 0.5;
    dropUniforms.uSpeedMinimum.value = speed * 0.88;
    dropUniforms.uSpeedMaximum.value = speed * 1.12;
    dropUniforms.uLengthMinimum.value = streakLength * 0.78;
    dropUniforms.uLengthMaximum.value = streakLength * 1.22;
    splashUniforms.uRadius.value = areaSize * 0.5;
    dropUniforms.uWind.value.set(
      Math.cos(direction) * windScale,
      Math.sin(direction) * windScale,
    );
    splashUniforms.uColor.value.copy(dropUniforms.uColor.value);
    splashUniforms.uOpacity.value = dropUniforms.uOpacity.value * 0.72;

    this.drops.geometry.instanceCount = Math.min(
      this.drops.capacity,
      Math.round(
        this.emissionRate * TOONLAB_RAIN_FIELD_PROFILE.drops.lifetimeSeconds,
      ),
    );
    this.splashes.geometry.instanceCount = Math.min(
      this.splashes.capacity,
      Math.round(this.emissionRate * 0.16),
    );
    this.#applyVisibility();
    return this;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.#applyVisibility();
    return this;
  }

  setFloorY(floorY) {
    this.floorY = Number(floorY) || 0;
    this.drops.material.uniforms.uFloorY.value = this.floorY;
    return this;
  }

  update(delta, { camera, renderer, floorY = this.floorY } = {}) {
    const seconds = Math.min(Math.max(Number(delta) || 0, 0), 0.1);
    this.elapsed += seconds;
    this.setFloorY(floorY);
    const dropUniforms = this.drops.material.uniforms;
    const splashUniforms = this.splashes.material.uniforms;
    dropUniforms.uTime.value = this.elapsed;
    splashUniforms.uTime.value = this.elapsed;

    if (camera) {
      camera.getWorldPosition(this.cameraPosition);
      camera.getWorldDirection(this.cameraDirection);
      this.spawnCenter
        .copy(this.cameraPosition)
        .addScaledVector(
          this.cameraDirection,
          TOONLAB_RAIN_FIELD_PROFILE.drops.cameraForwardOffsetMeters,
        );
      this.spawnCenter.y +=
        TOONLAB_RAIN_FIELD_PROFILE.drops.cameraVerticalOffsetMeters;
      dropUniforms.uCenter.value.copy(this.spawnCenter);
      splashUniforms.uCenter.value.set(
        this.spawnCenter.x,
        this.floorY,
        this.spawnCenter.z,
      );
    }
    if (renderer) {
      renderer.getDrawingBufferSize?.(this.renderSize);
      const height = Math.max(
        1,
        this.renderSize.y || renderer.domElement?.height || 540,
      );
      const fieldOfView = THREE.MathUtils.degToRad(camera?.fov || 50);
      const pointScale = height / (2 * Math.tan(fieldOfView * 0.5));
      dropUniforms.uPointScale.value = pointScale;
      splashUniforms.uPointScale.value = pointScale;
    }
    return this;
  }

  #applyVisibility() {
    this.drops.visible = this.enabled && this.drops.geometry.instanceCount > 0;
    this.splashes.visible = this.enabled
      && this.splashes.geometry.instanceCount > 0;
    this.visible = this.drops.visible || this.splashes.visible;
  }

  dispose() {
    this.drops.geometry.dispose();
    this.drops.material.dispose();
    this.splashes.geometry.dispose();
    this.splashes.material.dispose();
  }
}
