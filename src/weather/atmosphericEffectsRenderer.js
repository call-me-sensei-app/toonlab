// ToonLab-owned world-space renderers for airborne weather and electrical
// events. Atmospheric-condition documents provide normalized state; these
// profiles own particle topology, motion, materials, and runtime budgets.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
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
  step,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export const TOONLAB_WEATHER_FIELD_PROFILES = Object.freeze({
  flakes: Object.freeze({
    cameraForwardOffsetMeters: 8,
    cameraVerticalOffsetMeters: 9,
    cameraFadeMeters: Object.freeze([0.5, 6]),
    cylinderHeightMeters: 6,
    cylinderRadiusMeters: 20,
    drag: 1,
    gravityMetersPerSecondSquared: 2,
    lifetimeSeconds: 4,
    overcastBrightnessMultiplier: 0.5,
    rateMaximumPerSecond: 800,
    sizeMeters: Object.freeze([0.06, 0.12]),
    windCurlFrequency: 0.5,
    windCurlLoopSeconds: 4,
  }),
  embers: Object.freeze({
    cameraForwardOffsetMeters: 6,
    cameraVerticalOffsetMeters: 1,
    cylinderHeightMeters: 8,
    cylinderRadiusMeters: 20,
    lifetimeSeconds: Object.freeze([1.4, 1.75]),
    rateMaximumPerSecond: 180,
    sizeMeters: Object.freeze([0.035, 0.11]),
    windCurlFrequency: 0.8,
  }),
  mist: Object.freeze({
    cameraForwardOffsetMeters: 8,
    cylinderHeightMeters: 4,
    cylinderRadiusMeters: 24,
    downwardVelocityMetersPerSecond: 0.5,
    lifetimeSeconds: Object.freeze([2, 3]),
    rateMaximumPerSecond: 25,
    sizeMeters: Object.freeze([1, 2]),
  }),
  windStreaks: Object.freeze({
    boxMeters: Object.freeze([40, 10, 20]),
    heightMeters: Object.freeze([0.5, 1]),
    lengthMeters: Object.freeze([1.5, 2.5]),
    lifetimeSeconds: Object.freeze([7, 9]),
    rateMaximumPerSecond: 10,
  }),
  electrical: Object.freeze({
    distantBranchLifetimeSeconds: Object.freeze([0.3, 1]),
    distantBranchRadiusMeters: 50,
    distantBranchRateMaximum: 2,
    distantFlashSizeMeters: Object.freeze([120, 240]),
    nearStrikeLifetimeSeconds: Object.freeze([0.3, 0.5]),
  }),
});

const EFFECT_KIND = Object.freeze({
  ember: 1,
  flake: 0,
  mist: 2,
});

// The flash is an additive cloud illumination cue, not a full-screen exposure
// replacement. A low ceiling keeps the bolt readable while preserving the
// value structure inside night clouds at the peak of the pulse.
const LIGHTNING_FLASH_OPACITY = 0.015;

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

function seededQuadGeometry(capacity, attributeName, seed) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('uv', quad.attributes.uv);
  const seeds = new Float32Array(capacity * 4);
  const random = mulberry32(seed);
  for (let index = 0; index < seeds.length; index += 1) seeds[index] = random();
  geometry.setAttribute(
    attributeName,
    new THREE.InstancedBufferAttribute(seeds, 4),
  );
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  quad.dispose();
  return geometry;
}

function prepareEffectMesh(mesh, name, renderOrder) {
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.environmentShaderExclude = true;
  mesh.userData.waterExclude = true;
  return mesh;
}

function createAirborneMaterial(kind) {
  const flake = TOONLAB_WEATHER_FIELD_PROFILES.flakes;
  const ember = TOONLAB_WEATHER_FIELD_PROFILES.embers;
  const mist = TOONLAB_WEATHER_FIELD_PROFILES.mist;
  const profile = kind === EFFECT_KIND.flake
    ? flake
    : kind === EFFECT_KIND.ember
      ? ember
      : mist;
  const uniforms = {
    uAmount: uniform(0),
    uCenter: uniform(new THREE.Vector3()),
    uColor: uniform(new THREE.Color(1, 1, 1)),
    uFallSpeed: uniform(kind === EFFECT_KIND.flake ? 0.6 : 0),
    uFloorY: uniform(0),
    uGravityOffset: uniform(0),
    uHeight: uniform(profile.cylinderHeightMeters),
    uLifetime: uniform(
      kind === EFFECT_KIND.flake
        ? flake.lifetimeSeconds
        : profile.lifetimeSeconds[1],
    ),
    uOpacity: uniform(1),
    uOvercast: uniform(0),
    uPointScale: uniform(540),
    uRadius: uniform(profile.cylinderRadiusMeters),
    uShape: uniform(0),
    uSize: uniform(1),
    uTime: uniform(0),
    uTurbulence: uniform(1),
    uWind: uniform(new THREE.Vector2()),
  };

  const material = new NodeMaterial();
  material.name = kind === EFFECT_KIND.flake
    ? 'ToonLab flake field'
    : kind === EFFECT_KIND.ember
      ? 'ToonLab ember field'
      : 'ToonLab local mist field';
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.blending = kind === EFFECT_KIND.mist
    ? THREE.NormalBlending
    : THREE.AdditiveBlending;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;

  const varyingFade = varying(float(), `vToonLabAirborneFade${kind}`);
  const varyingSeed = varying(float(), `vToonLabAirborneSeed${kind}`);

  material.vertexNode = Fn(() => {
    const seed = attribute(`aToonLabAirborneSeed${kind}`, 'vec4');
    const lifetime = kind === EFFECT_KIND.flake
      ? uniforms.uLifetime
      : mix(profile.lifetimeSeconds[0], profile.lifetimeSeconds[1], seed.w);
    const age = mod(uniforms.uTime.add(seed.z.mul(lifetime)), lifetime).toVar();
    const life = age.div(lifetime).toVar();
    const angle = seed.x.mul(Math.PI * 2).toVar();
    const radialDistance = sqrt(seed.y)
      .mul(uniforms.uRadius)
      .toVar();
    const radial = vec2(cos(angle), sin(angle)).mul(radialDistance).toVar();
    const phase = uniforms.uTime
      .mul(profile.windCurlFrequency ?? 0.5)
      .add(seed.z.mul(Math.PI * 2))
      .toVar();
    const turbulence = vec2(
      sin(phase.add(seed.x.mul(4.7))),
      cos(phase.mul(0.73).add(seed.y.mul(6.1))),
    ).mul(uniforms.uTurbulence);
    const horizontal = radial
      .add(uniforms.uWind.mul(age))
      .add(turbulence.mul(kind === EFFECT_KIND.mist ? 0.7 : 0.42))
      .toVar();

    const spawnY = uniforms.uCenter.y
      .add(seed.w.sub(0.5).mul(uniforms.uHeight));
    let worldY = spawnY.toVar();
    if (kind === EFFECT_KIND.flake) {
      const gravity = max(
        0.25,
        float(flake.gravityMetersPerSecondSquared)
          .add(uniforms.uGravityOffset.negate().mul(0.45)),
      );
      worldY.subAssign(
        age.mul(uniforms.uFallSpeed).mul(mix(0.78, 1.22, seed.w))
          .add(age.mul(age).mul(gravity).mul(0.5)),
      );
    } else if (kind === EFFECT_KIND.ember) {
      worldY.addAssign(age.mul(mix(0.8, 1.8, seed.w)));
    } else {
      worldY.subAssign(age.mul(mist.downwardVelocityMetersPerSecond));
    }

    const worldPosition = vec3(
      uniforms.uCenter.x.add(horizontal.x),
      worldY,
      uniforms.uCenter.z.add(horizontal.y),
    ).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1)).toVar();
    const depth = max(mvPosition.z.negate(), 0.2).toVar();
    const baseSize = mix(
      profile.sizeMeters[0],
      profile.sizeMeters[1],
      seed.w,
    ).mul(uniforms.uSize);
    const aspect = kind === EFFECT_KIND.mist
      ? vec2(1, mix(0.28, 0.55, seed.x))
      : kind === EFFECT_KIND.ember
        ? vec2(mix(0.45, 0.8, seed.y), 1)
        : vec2(1, mix(0.82, 1.18, seed.y));
    const pixelSize = aspect
      .mul(baseSize)
      .mul(uniforms.uPointScale)
      .div(depth);
    const rotation = seed.x
      .mul(Math.PI * 2)
      .add(age.mul(kind === EFFECT_KIND.flake ? 1.4 : 0.45));
    const quad = positionGeometry.xy.toVar();
    const rotated = vec2(
      quad.x.mul(cos(rotation)).sub(quad.y.mul(sin(rotation))),
      quad.x.mul(sin(rotation)).add(quad.y.mul(cos(rotation))),
    );
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      rotated.mul(pixelSize).mul(float(2).div(viewportSize)).mul(clipPosition.w),
    );

    const lifeFade = smoothstep(0, 0.08, life)
      .mul(smoothstep(0.72, 1, life).oneMinus());
    const cameraFade = kind === EFFECT_KIND.flake
      ? smoothstep(
        flake.cameraFadeMeters[0],
        flake.cameraFadeMeters[1],
        length(worldPosition.sub(cameraPosition)),
      )
      : float(1);
    const floorFade = kind === EFFECT_KIND.flake
      ? smoothstep(uniforms.uFloorY, uniforms.uFloorY.add(0.3), worldY)
      : float(1);
    varyingFade.assign(
      lifeFade.mul(cameraFade.mul(cameraFade)).mul(floorFade),
    );
    varyingSeed.assign(seed.w);
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const point = uv().mul(2).sub(1).toVar();
    const radius = length(point).toVar();
    let mask = smoothstep(1, 0.36, radius).toVar();
    if (kind === EFFECT_KIND.flake) {
      const armX = smoothstep(0.28, 0.06, abs(point.x))
        .mul(smoothstep(1, 0.76, abs(point.y)));
      const armY = smoothstep(0.28, 0.06, abs(point.y))
        .mul(smoothstep(1, 0.76, abs(point.x)));
      const diagonal = smoothstep(
        0.2,
        0.045,
        abs(abs(point.x).sub(abs(point.y))),
      ).mul(smoothstep(1, 0.72, radius));
      const snowShape = clamp(
        max(mask.mul(0.62), max(armX, max(armY, diagonal))),
        0,
        1,
      );
      const ashShape = smoothstep(0.95, 0.34, radius)
        .mul(mix(0.5, 1, fract(varyingSeed.mul(37.1))));
      const pelletShape = smoothstep(0.78, 0.3, radius);
      const nonSnowShape = mix(
        ashShape,
        pelletShape,
        step(1.5, uniforms.uShape),
      );
      mask.assign(mix(
        snowShape,
        nonSnowShape,
        step(0.5, uniforms.uShape),
      ));
    } else if (kind === EFFECT_KIND.ember) {
      const core = smoothstep(0.9, 0.08, radius);
      const tail = smoothstep(0.22, 0.02, abs(point.x))
        .mul(smoothstep(-0.85, 0.45, point.y));
      mask.assign(max(core, tail.mul(0.5)));
    } else {
      const ellipse = length(vec2(point.x, point.y.mul(1.8)));
      mask.assign(
        smoothstep(1, 0.08, ellipse)
          .mul(smoothstep(0, 0.45, ellipse)),
      );
    }
    const overcastBrightness = kind === EFFECT_KIND.flake
      ? mix(
        mix(1, flake.overcastBrightnessMultiplier, uniforms.uOvercast),
        1,
        step(0.5, uniforms.uShape),
      )
      : float(1);
    const alpha = mask
      .mul(uniforms.uOpacity)
      .mul(uniforms.uAmount)
      .mul(overcastBrightness)
      .mul(varyingFade)
      .mul(mix(0.65, 1, varyingSeed))
      .toVar();
    Discard(alpha.lessThan(0.01));
    return vec4(uniforms.uColor.mul(overcastBrightness), alpha);
  })();

  material.uniforms = uniforms;
  material.userData.isToonNodeMaterial = true;
  return material;
}

function createWindStreakMaterial() {
  const profile = TOONLAB_WEATHER_FIELD_PROFILES.windStreaks;
  const uniforms = {
    uAmount: uniform(0),
    uCenter: uniform(new THREE.Vector3()),
    uColor: uniform(new THREE.Color(0.88, 0.94, 1)),
    uOpacity: uniform(0),
    uPointScale: uniform(540),
    uSpeed: uniform(1),
    uTime: uniform(0),
    uWind: uniform(new THREE.Vector2(1, 0)),
  };
  const material = new NodeMaterial();
  material.name = 'ToonLab wind streak field';
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;

  const varyingFade = varying(float(), 'vToonLabWindStreakFade');
  material.vertexNode = Fn(() => {
    const seed = attribute('aToonLabWindStreakSeed', 'vec4');
    const lifetime = mix(
      profile.lifetimeSeconds[0],
      profile.lifetimeSeconds[1],
      seed.w,
    ).toVar();
    const age = mod(uniforms.uTime.add(seed.z.mul(lifetime)), lifetime).toVar();
    const life = age.div(lifetime).toVar();
    const halfBox = vec3(
      profile.boxMeters[0] * 0.5,
      profile.boxMeters[1] * 0.5,
      profile.boxMeters[2] * 0.5,
    );
    const start = vec3(
      seed.x.mul(2).sub(1).mul(halfBox.x),
      seed.y.mul(2).sub(1).mul(halfBox.y),
      fract(seed.z.mul(17.3)).mul(2).sub(1).mul(halfBox.z),
    );
    const travelled = uniforms.uWind
      .mul(uniforms.uSpeed)
      .mul(age)
      .toVar();
    const localX = mod(start.x.add(travelled.x).add(halfBox.x), halfBox.x.mul(2))
      .sub(halfBox.x);
    const localZ = mod(start.z.add(travelled.y).add(halfBox.z), halfBox.z.mul(2))
      .sub(halfBox.z);
    const worldPosition = uniforms.uCenter.add(vec3(localX, start.y, localZ)).toVar();
    const worldVelocity = vec3(uniforms.uWind.x, 0, uniforms.uWind.y);
    const viewVelocity = cameraViewMatrix.mul(vec4(worldVelocity, 0)).xy.toVar();
    const along = normalize(viewVelocity).toVar();
    const across = vec2(along.y.negate(), along.x).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1)).toVar();
    const depth = max(mvPosition.z.negate(), 0.2).toVar();
    const widthPixels = mix(
      profile.heightMeters[0],
      profile.heightMeters[1],
      seed.y,
    ).mul(0.08).mul(uniforms.uPointScale).div(depth);
    const lengthPixels = mix(
      profile.lengthMeters[0],
      profile.lengthMeters[1],
      seed.w,
    ).mul(uniforms.uPointScale).div(depth);
    const pixelOffset = across
      .mul(positionGeometry.y.mul(widthPixels))
      .add(along.mul(positionGeometry.x.mul(lengthPixels)));
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      pixelOffset.mul(float(2).div(viewportSize)).mul(clipPosition.w),
    );
    const cameraFade = smoothstep(
      1.5,
      7,
      length(worldPosition.sub(cameraPosition)),
    );
    varyingFade.assign(
      smoothstep(0, 0.08, life)
        .mul(smoothstep(0.7, 1, life).oneMinus())
        .mul(cameraFade.mul(cameraFade)),
    );
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const point = uv().mul(2).sub(1).toVar();
    const center = smoothstep(1, 0.15, abs(point.y));
    const taperedEnds = smoothstep(1, 0.55, abs(point.x));
    const alpha = center
      .mul(taperedEnds)
      .mul(uniforms.uOpacity)
      .mul(uniforms.uAmount)
      .mul(varyingFade)
      .toVar();
    Discard(alpha.lessThan(0.008));
    return vec4(uniforms.uColor, alpha);
  })();

  material.uniforms = uniforms;
  material.userData.isToonNodeMaterial = true;
  return material;
}

function createFlashTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const alpha = Math.round((falloff ** 2.4) * 255);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  // DataTexture defaults to point sampling. The flash sprite spans a large
  // part of the sky, so nearest filtering turns this small radial mask into
  // visible square bands—especially obvious against dark clouds.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

class ElectricalWeatherRenderer extends THREE.Group {
  constructor({ seed = 0x1097 } = {}) {
    super();
    this.name = 'ToonLab electrical weather';
    this.seed = seed;
    this.elapsed = 0;
    this.enabled = true;
    this.cycle = -1;
    this.farArc = 0;
    this.farFlash = 0;
    this.nearRate = 0;
    this.lowColor = new THREE.Color(0.04, 0.2, 1);
    this.highColor = new THREE.Color(0.04, 0.07, 1);
    this.cameraPosition = new THREE.Vector3();
    this.cameraDirection = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.manualDuration = 0;
    this.manualElapsed = 0;
    this.manualPending = false;
    this.manualStrength = 0;
    this.flashTexture = createFlashTexture();

    const positions = new Float32Array(180 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const material = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: this.highColor,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });
    this.branch = new THREE.LineSegments(geometry, material);
    this.branch.name = 'ToonLab electrical branch';
    this.branch.frustumCulled = false;
    this.branch.renderOrder = 74;

    const flashMaterial = new THREE.SpriteMaterial({
      blending: THREE.AdditiveBlending,
      color: this.lowColor,
      depthTest: true,
      depthWrite: false,
      map: this.flashTexture,
      transparent: true,
    });
    this.flash = new THREE.Sprite(flashMaterial);
    this.flash.name = 'ToonLab cloud flash';
    this.flash.renderOrder = 73;
    this.flash.frustumCulled = false;
    this.add(this.flash, this.branch);
    this.#applyVisibility(false);
  }

  applyFrame(frame) {
    this.farArc = Math.max(0, Number(frame?.electric?.farArc) || 0);
    this.farFlash = Math.max(0, Number(frame?.electric?.farFlash) || 0);
    this.nearRate = Math.max(0, Number(frame?.electric?.nearRate) || 0);
    const low = frame?.electric?.tintLow ?? [0.04, 0.2, 1];
    const high = frame?.electric?.tintHigh ?? [0.04, 0.07, 1];
    this.lowColor.setRGB(Number(low[0]) || 0, Number(low[1]) || 0, Number(low[2]) || 0);
    this.highColor.setRGB(Number(high[0]) || 0, Number(high[1]) || 0, Number(high[2]) || 0);
    this.flash.material.color.copy(this.lowColor);
    this.branch.material.color.copy(this.highColor);
    return this;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.#applyVisibility(false);
    return this;
  }

  trigger({ duration = 0.3, strength = 1 } = {}) {
    this.manualDuration = Math.max(0.08, Number(duration) || 0.3);
    this.manualElapsed = 0;
    this.manualPending = true;
    this.manualStrength = Math.max(0, Number(strength) || 0);
    return this;
  }

  #regenerate(camera, cycle) {
    const random = mulberry32(this.seed ^ Math.imul(cycle + 1, 0x9e3779b9));
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraDirection);
    this.cameraRight.crossVectors(this.cameraDirection, camera.up).normalize();
    const distance = THREE.MathUtils.lerp(35, 55, random());
    const start = this.cameraPosition.clone()
      .addScaledVector(this.cameraDirection, distance)
      .addScaledVector(this.cameraRight, THREE.MathUtils.lerp(-22, 22, random()));
    start.y += THREE.MathUtils.lerp(20, 34, random());
    const endY = Math.max(0.5, start.y - THREE.MathUtils.lerp(20, 34, random()));
    const positions = this.branch.geometry.attributes.position.array;
    let cursor = 0;
    let current = start.clone();
    const segments = 14;
    for (let index = 0; index < segments; index += 1) {
      const progress = (index + 1) / segments;
      const next = new THREE.Vector3(
        current.x + THREE.MathUtils.lerp(-2.8, 2.8, random()),
        THREE.MathUtils.lerp(start.y, endY, progress),
        current.z + THREE.MathUtils.lerp(-1.2, 1.2, random()),
      );
      positions.set([current.x, current.y, current.z, next.x, next.y, next.z], cursor);
      cursor += 6;
      if (index > 2 && index < segments - 2 && random() < 0.34) {
        const branchEnd = next.clone()
          .addScaledVector(this.cameraRight, THREE.MathUtils.lerp(-6, 6, random()));
        branchEnd.y -= THREE.MathUtils.lerp(2, 7, random());
        branchEnd.z += THREE.MathUtils.lerp(-2, 2, random());
        positions.set(
          [next.x, next.y, next.z, branchEnd.x, branchEnd.y, branchEnd.z],
          cursor,
        );
        cursor += 6;
      }
      current.copy(next);
    }
    this.branch.geometry.setDrawRange(0, cursor / 3);
    this.branch.geometry.attributes.position.needsUpdate = true;
    this.flash.position.copy(start).addScaledVector(this.cameraDirection, 2);
    const size = THREE.MathUtils.lerp(
      TOONLAB_WEATHER_FIELD_PROFILES.electrical.distantFlashSizeMeters[0],
      TOONLAB_WEATHER_FIELD_PROFILES.electrical.distantFlashSizeMeters[1],
      random(),
    );
    this.flash.scale.set(size, size * 0.5, 1);
  }

  #applyVisibility(visible, flashOpacity = 0, branchOpacity = 0) {
    const active = this.enabled && visible;
    this.flash.visible = active && flashOpacity > 0.001;
    this.branch.visible = active && branchOpacity > 0.001;
    this.flash.material.opacity = flashOpacity;
    this.branch.material.opacity = branchOpacity;
    this.visible = this.flash.visible || this.branch.visible;
  }

  update(delta, { camera } = {}) {
    const stepSeconds = Math.min(Math.max(Number(delta) || 0, 0), 0.1);
    this.elapsed += stepSeconds;
    if (this.enabled && camera && this.manualStrength > 0) {
      if (this.manualPending) {
        this.manualPending = false;
        this.#regenerate(camera, Math.floor(this.elapsed * 1000));
      }
      this.manualElapsed += stepSeconds;
      const progress = this.manualElapsed / this.manualDuration;
      if (progress < 1) {
        const pulse = Math.sin(clamp01(progress) * Math.PI);
        this.#applyVisibility(
          true,
          pulse * clamp01(this.manualStrength) * LIGHTNING_FLASH_OPACITY,
          pulse * clamp01(this.manualStrength),
        );
        return this;
      }
      this.manualStrength = 0;
    }
    const strength = Math.max(this.farArc, this.farFlash, this.nearRate);
    if (!this.enabled || !camera || strength <= 0) {
      this.#applyVisibility(false);
      return this;
    }
    const interval = THREE.MathUtils.lerp(8, 2.2, clamp01(strength));
    const cycle = Math.floor(this.elapsed / interval);
    const phase = (this.elapsed % interval) / interval;
    const random = mulberry32(this.seed ^ Math.imul(cycle + 1, 0x85ebca6b));
    const shouldFire = random() < clamp01(0.18 + strength * 0.55);
    if (!shouldFire || phase > 0.16) {
      this.#applyVisibility(false);
      return this;
    }
    if (cycle !== this.cycle) {
      this.cycle = cycle;
      this.#regenerate(camera, cycle);
    }
    const pulse = Math.sin(clamp01(phase / 0.16) * Math.PI);
    this.#applyVisibility(
      true,
      pulse * clamp01(this.farFlash) * LIGHTNING_FLASH_OPACITY,
      pulse * clamp01(Math.max(this.farArc, this.nearRate * 6)),
    );
    return this;
  }

  dispose() {
    this.branch.geometry.dispose();
    this.branch.material.dispose();
    this.flash.material.dispose();
    this.flashTexture.dispose();
  }
}

export class AtmosphericEffectsRenderer extends THREE.Group {
  constructor({ seed = 0x51a7e } = {}) {
    super();
    this.name = 'ToonLab atmospheric effects';
    this.enabled = true;
    this.elapsed = 0;
    this.floorY = 0;
    this.cameraPosition = new THREE.Vector3();
    this.cameraDirection = new THREE.Vector3();
    this.renderSize = new THREE.Vector2();
    this.frame = null;

    const flakeProfile = TOONLAB_WEATHER_FIELD_PROFILES.flakes;
    this.flakes = prepareEffectMesh(
      new THREE.Mesh(
        seededQuadGeometry(
          flakeProfile.rateMaximumPerSecond * flakeProfile.lifetimeSeconds,
          `aToonLabAirborneSeed${EFFECT_KIND.flake}`,
          seed,
        ),
        createAirborneMaterial(EFFECT_KIND.flake),
      ),
      'ToonLab flakes',
      64,
    );
    this.flakes.capacity = this.flakes.geometry._maxInstanceCount
      ?? flakeProfile.rateMaximumPerSecond * flakeProfile.lifetimeSeconds;

    const emberProfile = TOONLAB_WEATHER_FIELD_PROFILES.embers;
    this.embers = prepareEffectMesh(
      new THREE.Mesh(
        seededQuadGeometry(
          Math.ceil(
            emberProfile.rateMaximumPerSecond * emberProfile.lifetimeSeconds[1],
          ),
          `aToonLabAirborneSeed${EFFECT_KIND.ember}`,
          seed ^ 0x7f4a7c15,
        ),
        createAirborneMaterial(EFFECT_KIND.ember),
      ),
      'ToonLab embers',
      65,
    );
    this.embers.capacity = Math.ceil(
      emberProfile.rateMaximumPerSecond * emberProfile.lifetimeSeconds[1],
    );

    const mistProfile = TOONLAB_WEATHER_FIELD_PROFILES.mist;
    this.mist = prepareEffectMesh(
      new THREE.Mesh(
        seededQuadGeometry(
          Math.ceil(mistProfile.rateMaximumPerSecond * mistProfile.lifetimeSeconds[1]),
          `aToonLabAirborneSeed${EFFECT_KIND.mist}`,
          seed ^ 0xc2b2ae35,
        ),
        createAirborneMaterial(EFFECT_KIND.mist),
      ),
      'ToonLab local mist',
      63,
    );
    this.mist.capacity = Math.ceil(
      mistProfile.rateMaximumPerSecond * mistProfile.lifetimeSeconds[1],
    );

    const windProfile = TOONLAB_WEATHER_FIELD_PROFILES.windStreaks;
    this.windStreaks = prepareEffectMesh(
      new THREE.Mesh(
        seededQuadGeometry(
          Math.ceil(
            windProfile.rateMaximumPerSecond * windProfile.lifetimeSeconds[1],
          ),
          'aToonLabWindStreakSeed',
          seed ^ 0x27d4eb2f,
        ),
        createWindStreakMaterial(),
      ),
      'ToonLab wind streaks',
      66,
    );
    this.windStreaks.capacity = Math.ceil(
      windProfile.rateMaximumPerSecond * windProfile.lifetimeSeconds[1],
    );
    this.electrical = new ElectricalWeatherRenderer({ seed: seed ^ 0x165667b1 });
    this.add(
      this.mist,
      this.flakes,
      this.embers,
      this.windStreaks,
      this.electrical,
    );
    this.applyFrame(null);
  }

  applyFrame(frame) {
    this.frame = frame;
    const flake = frame?.precipitation?.flakes;
    const ember = frame?.precipitation?.embers;
    const mist = frame?.fog?.mist;
    const flow = frame?.flow;
    const flakeAmount = clamp01(flake?.amount);
    const emberAmount = clamp01(ember?.amount);
    const mistAmount = clamp01(mist?.amount);
    const isAsh = frame?.profile?.id === 'ashFall';
    const flakeKind = String(flake?.kind ?? (isAsh ? 'ash' : 'snow'));
    const flakeShape = flakeKind === 'snow'
      ? 0
      : flakeKind === 'hail' || flakeKind === 'sleet'
        ? 2
        : 1;
    const windDirection = THREE.MathUtils.degToRad(
      Number(flow?.directionDegrees) || 0,
    );
    const windMinimum = Math.max(0, Number(flow?.minimum) || 0);
    const windMaximum = Math.max(windMinimum, Number(flow?.maximum) || 0);
    const windSpeed = (windMinimum + windMaximum) * 0.5;
    const windX = Math.cos(windDirection);
    const windZ = Math.sin(windDirection);

    const flakeUniforms = this.flakes.material.uniforms;
    const flakeBlending = flakeShape === 1
      ? THREE.NormalBlending
      : THREE.AdditiveBlending;
    if (this.flakes.material.blending !== flakeBlending) {
      this.flakes.material.blending = flakeBlending;
      this.flakes.material.needsUpdate = true;
    }
    const flakeTint = flake?.tint ?? [1, 1, 1, 0.6];
    flakeUniforms.uAmount.value = flakeAmount;
    flakeUniforms.uFallSpeed.value = Math.max(
      0.05,
      Number(flake?.speed) || 0.6,
    );
    flakeUniforms.uHeight.value = Math.max(
      2,
      Math.min(24, Number(flake?.fallHeight) || 6),
    );
    flakeUniforms.uLifetime.value = Math.max(
      0.4,
      Math.min(
        TOONLAB_WEATHER_FIELD_PROFILES.flakes.lifetimeSeconds,
        Number(flake?.lifetime)
          || TOONLAB_WEATHER_FIELD_PROFILES.flakes.lifetimeSeconds,
      ),
    );
    flakeUniforms.uRadius.value = Math.max(
      2,
      (Number(flake?.areaSize) || 40) * 0.5,
    );
    flakeUniforms.uShape.value = flakeShape;
    flakeUniforms.uColor.value.setRGB(
      Number(flakeTint[0]) || 0,
      Number(flakeTint[1]) || 0,
      Number(flakeTint[2]) || 0,
      THREE.SRGBColorSpace,
    );
    flakeUniforms.uOpacity.value = clamp01(flakeTint[3] ?? 0.6);
    flakeUniforms.uGravityOffset.value = Number(flake?.gravity) || 0;
    flakeUniforms.uOvercast.value = clamp01(frame?.ceiling?.amount);
    flakeUniforms.uSize.value = Math.max(0.2, Number(flake?.size) || 1);
    flakeUniforms.uTurbulence.value = Math.max(
      0,
      Number(flake?.turbulence) || 0,
    );
    flakeUniforms.uWind.value.set(windX, windZ).multiplyScalar(windSpeed * 0.28);
    this.flakes.geometry.instanceCount = Math.min(
      this.flakes.capacity,
      Math.round(
        (
          Number(frame?.precipitation?.emission?.flakes)
          || flakeAmount
            * TOONLAB_WEATHER_FIELD_PROFILES.flakes.rateMaximumPerSecond
        ) * flakeUniforms.uLifetime.value,
      ),
    );

    const emberUniforms = this.embers.material.uniforms;
    const emberTint = ember?.tint ?? [1, 0.38, 0.17, 1];
    emberUniforms.uAmount.value = emberAmount;
    emberUniforms.uColor.value.setRGB(
      Number(emberTint[0]) || 0,
      Number(emberTint[1]) || 0,
      Number(emberTint[2]) || 0,
      THREE.SRGBColorSpace,
    );
    emberUniforms.uOpacity.value = clamp01(emberTint[3] ?? 1);
    emberUniforms.uSize.value = Math.max(0.25, Number(ember?.size) || 1);
    emberUniforms.uTurbulence.value = Math.max(
      0,
      Number(ember?.turbulence) || 0,
    );
    emberUniforms.uWind.value.set(windX, windZ).multiplyScalar(windSpeed * 0.18);
    this.embers.geometry.instanceCount = Math.min(
      this.embers.capacity,
      Math.round(emberAmount * this.embers.capacity),
    );

    const mistUniforms = this.mist.material.uniforms;
    const mistTint = mist?.tint ?? [0.41, 0.55, 1, 0.06];
    mistUniforms.uAmount.value = mistAmount;
    mistUniforms.uColor.value.setRGB(
      Number(mistTint[0]) || 0,
      Number(mistTint[1]) || 0,
      Number(mistTint[2]) || 0,
      THREE.SRGBColorSpace,
    );
    mistUniforms.uOpacity.value = clamp01(mistTint[3] ?? 0.06);
    mistUniforms.uTurbulence.value = 0.45 + mistAmount * 0.65;
    mistUniforms.uWind.value.set(windX, windZ).multiplyScalar(windSpeed * 0.22);
    this.mist.geometry.instanceCount = Math.min(
      this.mist.capacity,
      Math.round(
        (Number(frame?.precipitation?.emission?.mist) || 0)
          * TOONLAB_WEATHER_FIELD_PROFILES.mist.lifetimeSeconds[1],
      ),
    );

    const streakUniforms = this.windStreaks.material.uniforms;
    const streakAmount = clamp01(flow?.streakAmount);
    const streakTint = flow?.streakTint ?? [0.88, 0.94, 1];
    streakUniforms.uAmount.value = streakAmount;
    streakUniforms.uColor.value.setRGB(
      Number(streakTint[0]) || 0,
      Number(streakTint[1]) || 0,
      Number(streakTint[2]) || 0,
      THREE.SRGBColorSpace,
    );
    streakUniforms.uOpacity.value = clamp01(flow?.streakOpacity);
    streakUniforms.uSpeed.value = Math.max(0.1, windSpeed);
    streakUniforms.uWind.value.set(windX, windZ);
    this.windStreaks.geometry.instanceCount = Math.min(
      this.windStreaks.capacity,
      Math.round(
        streakAmount
          * clamp01(windSpeed / 10)
          * TOONLAB_WEATHER_FIELD_PROFILES.windStreaks.rateMaximumPerSecond
          * TOONLAB_WEATHER_FIELD_PROFILES.windStreaks.lifetimeSeconds[1],
      ),
    );
    this.electrical.applyFrame(frame);
    this.#applyVisibility();
    return this;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.electrical.setEnabled(this.enabled);
    this.#applyVisibility();
    return this;
  }

  triggerElectrical(options = {}) {
    this.electrical.trigger(options);
    return this;
  }

  update(delta, { camera, renderer, floorY = this.floorY } = {}) {
    this.elapsed += Math.min(Math.max(Number(delta) || 0, 0), 0.1);
    this.floorY = Number(floorY) || 0;
    const meshes = [this.flakes, this.embers, this.mist, this.windStreaks];
    for (const mesh of meshes) {
      mesh.material.uniforms.uTime.value = this.elapsed;
      if (mesh.material.uniforms.uFloorY) {
        mesh.material.uniforms.uFloorY.value = this.floorY;
      }
    }
    if (camera) {
      camera.getWorldPosition(this.cameraPosition);
      camera.getWorldDirection(this.cameraDirection);
      const setCenter = (mesh, forward, vertical) => {
        mesh.material.uniforms.uCenter.value
          .copy(this.cameraPosition)
          .addScaledVector(this.cameraDirection, forward);
        mesh.material.uniforms.uCenter.value.y += vertical;
      };
      setCenter(
        this.flakes,
        TOONLAB_WEATHER_FIELD_PROFILES.flakes.cameraForwardOffsetMeters,
        TOONLAB_WEATHER_FIELD_PROFILES.flakes.cameraVerticalOffsetMeters,
      );
      setCenter(
        this.embers,
        TOONLAB_WEATHER_FIELD_PROFILES.embers.cameraForwardOffsetMeters,
        TOONLAB_WEATHER_FIELD_PROFILES.embers.cameraVerticalOffsetMeters,
      );
      setCenter(
        this.mist,
        TOONLAB_WEATHER_FIELD_PROFILES.mist.cameraForwardOffsetMeters,
        this.floorY + 2 - this.cameraPosition.y,
      );
      setCenter(this.windStreaks, 10, 1);
    }
    if (renderer) {
      renderer.getDrawingBufferSize?.(this.renderSize);
      const height = Math.max(
        1,
        this.renderSize.y || renderer.domElement?.height || 540,
      );
      const fieldOfView = THREE.MathUtils.degToRad(camera?.fov || 50);
      const pointScale = height / (2 * Math.tan(fieldOfView * 0.5));
      for (const mesh of meshes) {
        mesh.material.uniforms.uPointScale.value = pointScale;
      }
    }
    this.electrical.update(delta, { camera });
    return this;
  }

  #applyVisibility() {
    for (const mesh of [this.flakes, this.embers, this.mist, this.windStreaks]) {
      mesh.visible = this.enabled && mesh.geometry.instanceCount > 0;
    }
    this.visible = this.enabled;
  }

  dispose() {
    for (const mesh of [this.flakes, this.embers, this.mist, this.windStreaks]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.electrical.dispose();
  }
}
