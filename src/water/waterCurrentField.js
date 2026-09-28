import * as THREE from 'three';

const DEFAULT_MAX_SPEED = 8;
const sampleScratch = new THREE.Vector2();

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return THREE.MathUtils.clamp(finiteOr(value, 0), 0, 1);
}

function smoothstep01(value) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function vector2Components(value, fallbackX = 0, fallbackZ = 0) {
  if (Array.isArray(value)) {
    return [finiteOr(value[0], fallbackX), finiteOr(value[1], fallbackZ)];
  }
  return [
    finiteOr(value?.x ?? value?.[0], fallbackX),
    finiteOr(value?.z ?? value?.y ?? value?.[1], fallbackZ),
  ];
}

// Constructor regions use full width/depth. Vector4 uses the shader-facing
// (centerX, centerZ, halfWidth, halfDepth) convention shared by ripple and
// shoreline atlases.
function normalizeRegion(region) {
  if (region?.isVector4) {
    return {
      centerX: finiteOr(region.x, 0),
      centerZ: finiteOr(region.y, 0),
      width: Math.max(finiteOr(region.z, 16) * 2, 0.1),
      depth: Math.max(finiteOr(region.w, 16) * 2, 0.1),
    };
  }
  if (Array.isArray(region)) {
    return {
      centerX: finiteOr(region[0], 0),
      centerZ: finiteOr(region[1], 0),
      width: Math.max(finiteOr(region[2], 32), 0.1),
      depth: Math.max(finiteOr(region[3], 32), 0.1),
    };
  }
  if (region?.min && region?.max) {
    const minX = finiteOr(region.min.x, -16);
    const minZ = finiteOr(region.min.z ?? region.min.y, -16);
    const maxX = finiteOr(region.max.x, 16);
    const maxZ = finiteOr(region.max.z ?? region.max.y, 16);
    return {
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
      width: Math.max(maxX - minX, 0.1),
      depth: Math.max(maxZ - minZ, 0.1),
    };
  }
  const center = region?.center;
  const size = region?.size;
  return {
    centerX: finiteOr(region?.centerX ?? center?.x ?? region?.x, 0),
    centerZ: finiteOr(region?.centerZ ?? center?.z ?? center?.y ?? region?.z, 0),
    width: Math.max(finiteOr(
      region?.width ?? size?.x ??
        (Number.isFinite(region?.halfWidth) ? region.halfWidth * 2 : undefined),
      32,
    ), 0.1),
    depth: Math.max(finiteOr(
      region?.depth ?? size?.z ?? size?.y ??
        (Number.isFinite(region?.halfDepth) ? region.halfDepth * 2 : undefined),
      32,
    ), 0.1),
  };
}

function normalizeResolution(resolution) {
  let x;
  let y;
  if (Number.isFinite(resolution)) {
    x = resolution;
    y = resolution;
  } else if (Array.isArray(resolution)) {
    [x, y] = resolution;
  } else {
    x = resolution?.x ?? resolution?.width;
    y = resolution?.y ?? resolution?.height;
  }
  return {
    x: THREE.MathUtils.clamp(Math.round(finiteOr(x, 128)), 2, 2048),
    y: THREE.MathUtils.clamp(Math.round(finiteOr(y, 128)), 2, 2048),
  };
}

function resolveVelocity(result, out) {
  if (result === false || result === null) return false;
  if (Array.isArray(result)) {
    out.set(finiteOr(result[0], NaN), finiteOr(result[1], NaN));
  } else if (result && result !== out) {
    out.set(
      finiteOr(result.x ?? result[0], NaN),
      finiteOr(result.z ?? result.y ?? result[1], NaN),
    );
  }
  return Number.isFinite(out.x) && Number.isFinite(out.y);
}

/**
 * CPU-authored, world-space horizontal current field.
 *
 * The CPU retains full-precision velocity/mask arrays for gameplay queries.
 * A compact linearly-filtered RGBA8 texture mirrors the field for lightweight
 * GPU consumers such as shoreline-foam advection:
 *
 *   R/G = signed X/Z velocity encoded around 0.5
 *   B   = fluid/obstacle weight
 *   A   = valid authored domain
 *
 * This is deliberately not a shallow-water or Navier-Stokes solver. The
 * caller authors the large-scale velocity (`velocitySampler`) and optional
 * water-domain mask. A signed-distance sampler adds a deterministic
 * no-penetration projection near banks/rocks, but it cannot infer circulation,
 * pressure, wakes, separation, or downstream turbulence. Those need authored
 * vectors, a flow-map bake, or a real fluid solver upstream.
 *
 * `velocitySampler(x, z, out, context)` may mutate `out` or return a Vector2,
 * `[vx, vz]`, `{ x, z }`, `false`, or `null`. `context.time` lets a caller bake
 * a new tidal phase. For cheap whole-field tidal reversal between bakes, use
 * `setStrength(-1)`; CPU and GPU consumers receive the same multiplier.
 */
export class WaterCurrentField {
  constructor({
    region = {},
    resolution = { x: 128, y: 128 },
    velocity = [0, 0],
    velocitySampler = null,
    sampler = velocitySampler,
    maskSampler = null,
    domainMaskSampler = maskSampler,
    signedDistanceSampler = null,
    obstacleDistanceSampler = signedDistanceSampler,
    obstacleInfluence = 1,
    obstacleDeflection = 1,
    preserveTangentialSpeed = 0.7,
    obstacleGradientStep = null,
    maxSpeed = DEFAULT_MAX_SPEED,
    strength = 1,
    time = 0,
  } = {}) {
    const normalizedRegion = normalizeRegion(region);
    const normalizedResolution = normalizeResolution(resolution);
    this.isWaterCurrentField = true;
    this.centerX = normalizedRegion.centerX;
    this.centerZ = normalizedRegion.centerZ;
    this.worldWidth = normalizedRegion.width;
    this.worldDepth = normalizedRegion.depth;
    this.resolutionX = normalizedResolution.x;
    this.resolutionY = normalizedResolution.y;
    this.region = new THREE.Vector4(
      this.centerX,
      this.centerZ,
      this.worldWidth * 0.5,
      this.worldDepth * 0.5,
    );
    this.minX = this.centerX - this.worldWidth * 0.5;
    this.minZ = this.centerZ - this.worldDepth * 0.5;
    this.cellSizeX = this.worldWidth / this.resolutionX;
    this.cellSizeZ = this.worldDepth / this.resolutionY;

    const [constantX, constantZ] = vector2Components(velocity);
    this.constantVelocity = new THREE.Vector2(constantX, constantZ);
    this.velocitySampler = typeof sampler === 'function' ? sampler : null;
    this.maskSampler = typeof domainMaskSampler === 'function' ? domainMaskSampler : null;
    this.obstacleDistanceSampler = typeof obstacleDistanceSampler === 'function'
      ? obstacleDistanceSampler
      : null;
    this.obstacleInfluence = Math.max(finiteOr(obstacleInfluence, 1), 0);
    this.obstacleDeflection = clamp01(obstacleDeflection);
    this.preserveTangentialSpeed = clamp01(preserveTangentialSpeed);
    this.obstacleGradientStep = Math.max(
      finiteOr(obstacleGradientStep, Math.min(this.cellSizeX, this.cellSizeZ) * 0.75),
      1e-3,
    );
    this.maxSpeed = Math.max(finiteOr(maxSpeed, DEFAULT_MAX_SPEED), 1e-3);
    this.strength = finiteOr(strength, 1);
    this.time = finiteOr(time, 0);
    this.revision = 0;
    this.disposed = false;
    /** @type {{ time: number, field: WaterCurrentField }} */
    this.sampleContext = { time: this.time, field: this };

    const count = this.resolutionX * this.resolutionY;
    this.velocities = new Float32Array(count * 2);
    this.weights = new Float32Array(count);
    this.validity = new Float32Array(count);
    this.encodedData = new Uint8Array(count * 4);
    this.texture = new THREE.DataTexture(
      this.encodedData,
      this.resolutionX,
      this.resolutionY,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.texture.name = 'waterCurrentField';
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.unpackAlignment = 1;

    this.rebuild({ time: this.time });
  }

  getRegion(out = new THREE.Vector4()) {
    return out.copy(this.region);
  }

  containsPoint(x, z) {
    return Number.isFinite(x) && Number.isFinite(z) &&
      x >= this.minX && x <= this.minX + this.worldWidth &&
      z >= this.minZ && z <= this.minZ + this.worldDepth;
  }

  setStrength(strength) {
    this.strength = finiteOr(strength, this.strength);
    return this;
  }

  setTime(time, { rebuild = true } = {}) {
    this.time = finiteOr(time, this.time);
    if (rebuild) this.rebuild({ time: this.time });
    return this;
  }

  setVelocitySampler(sampler, { rebuild = true } = {}) {
    if (sampler != null && typeof sampler !== 'function') {
      throw new TypeError('WaterCurrentField velocitySampler must be a function or null.');
    }
    this.velocitySampler = sampler ?? null;
    if (rebuild) this.rebuild();
    return this;
  }

  setMaskSampler(sampler, { rebuild = true } = {}) {
    if (sampler != null && typeof sampler !== 'function') {
      throw new TypeError('WaterCurrentField maskSampler must be a function or null.');
    }
    this.maskSampler = sampler ?? null;
    if (rebuild) this.rebuild();
    return this;
  }

  setObstacleDistanceSampler(sampler, { rebuild = true } = {}) {
    if (sampler != null && typeof sampler !== 'function') {
      throw new TypeError(
        'WaterCurrentField obstacleDistanceSampler must be a function or null.',
      );
    }
    this.obstacleDistanceSampler = sampler ?? null;
    if (rebuild) this.rebuild();
    return this;
  }

  // Applies the local solid-boundary approximation in-place. Positive signed
  // distance is fluid; <= 0 is solid. The gradient points out of the solid,
  // so only velocity aimed into it is removed.
  projectAtObstacle(x, z, velocity, distance) {
    if (!this.obstacleDistanceSampler || !Number.isFinite(distance)) return 1;
    if (distance <= 0) {
      velocity.set(0, 0);
      return 0;
    }

    const influence = this.obstacleInfluence;
    if (influence <= 0 || distance >= influence) return 1;
    const h = this.obstacleGradientStep;
    const left = Number(this.obstacleDistanceSampler(x - h, z, this.sampleContext));
    const right = Number(this.obstacleDistanceSampler(x + h, z, this.sampleContext));
    const down = Number(this.obstacleDistanceSampler(x, z - h, this.sampleContext));
    const up = Number(this.obstacleDistanceSampler(x, z + h, this.sampleContext));
    const gradientX = right - left;
    const gradientZ = up - down;
    const gradientLength = Math.hypot(gradientX, gradientZ);
    const avoidance = (1 - smoothstep01(distance / influence)) * this.obstacleDeflection;
    if (gradientLength > 1e-6 && avoidance > 0) {
      const normalX = gradientX / gradientLength;
      const normalZ = gradientZ / gradientLength;
      const inward = velocity.x * normalX + velocity.y * normalZ;
      if (inward < 0) {
        const originalSpeed = velocity.length();
        velocity.x -= normalX * inward * avoidance;
        velocity.y -= normalZ * inward * avoidance;
        const projectedSpeed = velocity.length();
        if (projectedSpeed > 1e-5 && originalSpeed > projectedSpeed) {
          const preservedSpeed = THREE.MathUtils.lerp(
            projectedSpeed,
            originalSpeed,
            avoidance * this.preserveTangentialSpeed,
          );
          velocity.multiplyScalar(preservedSpeed / projectedSpeed);
        }
      }
    }
    // Feather the last fraction of a cell so linear GPU sampling does not
    // carry a full-speed texel across a solid boundary.
    const feather = Math.max(Math.min(influence * 0.25, Math.hypot(
      this.cellSizeX,
      this.cellSizeZ,
    )), 1e-3);
    return smoothstep01(distance / feather);
  }

  rebuild({ time = this.time } = {}) {
    if (this.disposed) return this;
    this.time = finiteOr(time, this.time);
    this.sampleContext.time = this.time;
    const width = this.resolutionX;
    const height = this.resolutionY;
    const maximum = this.maxSpeed;

    for (let y = 0; y < height; y += 1) {
      const worldZ = this.minZ + (y + 0.5) * this.cellSizeZ;
      for (let x = 0; x < width; x += 1) {
        const worldX = this.minX + (x + 0.5) * this.cellSizeX;
        const index = y * width + x;
        const velocityIndex = index * 2;
        const textureIndex = index * 4;
        sampleScratch.copy(this.constantVelocity);
        let valid = true;
        if (this.velocitySampler) {
          const result = this.velocitySampler(
            worldX,
            worldZ,
            sampleScratch,
            this.sampleContext,
          );
          valid = resolveVelocity(result, sampleScratch);
        }

        let weight = valid ? 1 : 0;
        if (valid && this.maskSampler) {
          weight *= clamp01(this.maskSampler(worldX, worldZ, this.sampleContext));
        }
        if (valid && this.obstacleDistanceSampler) {
          const distance = Number(
            this.obstacleDistanceSampler(worldX, worldZ, this.sampleContext),
          );
          if (Number.isFinite(distance)) {
            weight *= this.projectAtObstacle(worldX, worldZ, sampleScratch, distance);
          }
        }

        if (!valid || weight <= 0) sampleScratch.set(0, 0);
        const speed = sampleScratch.length();
        if (speed > maximum) sampleScratch.multiplyScalar(maximum / speed);
        this.velocities[velocityIndex] = sampleScratch.x;
        this.velocities[velocityIndex + 1] = sampleScratch.y;
        this.weights[index] = clamp01(weight);
        this.validity[index] = valid ? 1 : 0;
        // Reserve byte 128 as exact zero. A conventional UNORM 0.5 bias
        // decodes 128/255 to +1/255, which becomes a persistent 3.1 cm/s
        // diagonal drift at the default 8 m/s range even in authored still
        // water. Codes 1..255 provide a symmetric signed 127-step range;
        // code 0 remains unused by valid velocity samples.
        this.encodedData[textureIndex] = Math.round(
          128 + THREE.MathUtils.clamp(sampleScratch.x / maximum, -1, 1) * 127,
        );
        this.encodedData[textureIndex + 1] = Math.round(
          128 + THREE.MathUtils.clamp(sampleScratch.y / maximum, -1, 1) * 127,
        );
        this.encodedData[textureIndex + 2] = Math.round(this.weights[index] * 255);
        this.encodedData[textureIndex + 3] = valid ? 255 : 0;
      }
    }
    this.texture.needsUpdate = true;
    this.revision += 1;
    return this;
  }

  sampleChannelsAt(x, z, out) {
    if (!this.containsPoint(x, z)) {
      out.vx = 0;
      out.vz = 0;
      out.weight = 0;
      out.valid = 0;
      return out;
    }
    const pixelX = (x - this.minX) / this.worldWidth * this.resolutionX - 0.5;
    const pixelY = (z - this.minZ) / this.worldDepth * this.resolutionY - 0.5;
    const baseX = Math.floor(pixelX);
    const baseY = Math.floor(pixelY);
    const x0 = THREE.MathUtils.clamp(baseX, 0, this.resolutionX - 1);
    const y0 = THREE.MathUtils.clamp(baseY, 0, this.resolutionY - 1);
    const x1 = THREE.MathUtils.clamp(baseX + 1, 0, this.resolutionX - 1);
    const y1 = THREE.MathUtils.clamp(baseY + 1, 0, this.resolutionY - 1);
    const tx = THREE.MathUtils.clamp(pixelX - baseX, 0, 1);
    const ty = THREE.MathUtils.clamp(pixelY - baseY, 0, 1);
    const i00 = y0 * this.resolutionX + x0;
    const i10 = y0 * this.resolutionX + x1;
    const i01 = y1 * this.resolutionX + x0;
    const i11 = y1 * this.resolutionX + x1;
    const bilerp = (array, stride = 1, offset = 0) => {
      const a = THREE.MathUtils.lerp(
        array[i00 * stride + offset],
        array[i10 * stride + offset],
        tx,
      );
      const b = THREE.MathUtils.lerp(
        array[i01 * stride + offset],
        array[i11 * stride + offset],
        tx,
      );
      return THREE.MathUtils.lerp(a, b, ty);
    };
    out.vx = bilerp(this.velocities, 2, 0);
    out.vz = bilerp(this.velocities, 2, 1);
    out.weight = bilerp(this.weights);
    out.valid = bilerp(this.validity);
    return out;
  }

  /** Bilinear CPU sample in metres/second. Outside/solid/invalid = (0, 0). */
  sampleAt(x, z, out = new THREE.Vector2()) {
    const channels = this.sampleChannelsAt(x, z, WaterCurrentField._sampleChannels);
    const scale = channels.weight * channels.valid * this.strength;
    return out.set(channels.vx * scale, channels.vz * scale);
  }

  /** Fluid-domain weight after obstacle and validity feathering, 0..1. */
  sampleWeightAt(x, z) {
    const channels = this.sampleChannelsAt(x, z, WaterCurrentField._sampleChannels);
    return clamp01(channels.weight * channels.valid);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.dispose();
  }
}

WaterCurrentField._sampleChannels = { vx: 0, vz: 0, weight: 0, valid: 0 };
