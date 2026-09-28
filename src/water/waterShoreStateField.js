import * as THREE from 'three';

import { createWaterShoreStateSimulationNodeMaterial } from
  '../shaders-tsl/water-shore-state-simulation.js';
import {
  samplePrimarySwellSequence,
  sampleSwashDistance,
  sampleSwashEventShape,
  shapeSwashProgress,
} from './waterSettings.js';

const FIXED_TIMESTEP = 1 / 30;
const MAX_SUBSTEPS_PER_FRAME = 2;

const DEFAULT_PARAMETERS = Object.freeze({
  moistureWetTime: 0.12,
  moistureDryTime: 120,
  filmWetTime: 0.08,
  filmDryTime: 2,
  foamWetLifetime: 6,
  foamDryLifetime: 2,
  residueLifetime: 12,
  foamGain: 7,
  foamAdvection: 1,
  foamDiffusion: 0.012,
  // Keep both source octaves above the 23 cm state-atlas Nyquist footprint.
  // Broader cells survive advection as readable torn rafts instead of
  // aliasing into small, cut-out scallops at the moving lip.
  noiseScale: 0.32,
  baseCurrent: Object.freeze([0, 0]),
});

const NUMERIC_PARAMETER_UNIFORMS = Object.freeze({
  moistureWetTime: 'uMoistureWetTime',
  moistureDryTime: 'uMoistureDryTime',
  filmWetTime: 'uFilmWetTime',
  filmDryTime: 'uFilmDryTime',
  foamWetLifetime: 'uFoamWetLifetime',
  foamDryLifetime: 'uFoamDryLifetime',
  residueLifetime: 'uResidueLifetime',
  foamGain: 'uFoamGain',
  foamAdvection: 'uFoamAdvection',
  foamDiffusion: 'uFoamDiffusion',
  noiseScale: 'uNoiseScale',
});

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
    x: THREE.MathUtils.clamp(Math.round(finiteOr(x, 512)), 16, 2048),
    y: THREE.MathUtils.clamp(Math.round(finiteOr(y, 128)), 16, 2048),
  };
}

// Constructor regions use full width/depth. A Vector4 is accepted as the
// shader-facing (centerX, centerZ, halfWidth, halfDepth) representation.
function normalizeRegion(region) {
  if (region?.isVector4) {
    return {
      centerX: finiteOr(region.x, 0),
      centerZ: finiteOr(region.y, 0),
      width: Math.max(finiteOr(region.z, 16) * 2, 0.1),
      depth: Math.max(finiteOr(region.w, 8) * 2, 0.1),
    };
  }
  if (Array.isArray(region)) {
    return {
      centerX: finiteOr(region[0], 0),
      centerZ: finiteOr(region[1], 0),
      width: Math.max(finiteOr(region[2], 32), 0.1),
      depth: Math.max(finiteOr(region[3], 16), 0.1),
    };
  }
  if (region?.min && region?.max) {
    const minX = finiteOr(region.min.x, -16);
    const minZ = finiteOr(region.min.y ?? region.min.z, -8);
    const maxX = finiteOr(region.max.x, 16);
    const maxZ = finiteOr(region.max.y ?? region.max.z, 8);
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
      region?.width ?? size?.x ?? (Number.isFinite(region?.halfWidth) ? region.halfWidth * 2 : undefined),
      32,
    ), 0.1),
    depth: Math.max(finiteOr(
      region?.depth ?? size?.z ?? size?.y ??
        (Number.isFinite(region?.halfDepth) ? region.halfDepth * 2 : undefined),
      16,
    ), 0.1),
  };
}

function vector2Components(value, fallbackX = 0, fallbackY = 0) {
  if (Array.isArray(value)) {
    return [finiteOr(value[0], fallbackX), finiteOr(value[1], fallbackY)];
  }
  return [
    finiteOr(value?.x ?? value?.[0], fallbackX),
    finiteOr(value?.y ?? value?.z ?? value?.[1], fallbackY),
  ];
}

function eventHash(value) {
  let x = ((value * 0.1031) % 1 + 1) % 1;
  x *= x + 33.33;
  x *= x + x;
  return ((x % 1) + 1) % 1;
}

function eventNoiseOffset(index, out) {
  return out.set(eventHash(index + 17.17), eventHash(index + 83.91));
}

function waveEnergyFrom(waves) {
  return (waves ?? []).reduce(
    (sum, wave) => sum + Math.abs(finiteOr(wave?.amplitude, 0)),
    0,
  );
}

function sampleProgressAt(waves, time) {
  return shapeSwashProgress(samplePrimarySwellSequence(waves, time).cycle);
}

function buildFallbackSwashFrame(waves, time, runupDistance) {
  const sequence = samplePrimarySwellSequence(waves, time);
  const progress = shapeSwashProgress(sequence.cycle);
  const derivativeStep = 1 / 120;
  const progressSpeed = (
    sampleProgressAt(waves, time + derivativeStep) -
    sampleProgressAt(waves, time - derivativeStep)
  ) / (derivativeStep * 2);
  const explicit = runupDistance > 0.01;
  const edgeDistance = explicit ? sampleSwashDistance(waves, time, runupDistance) : 0;
  const edgeDistanceSpeed = explicit ? (
    sampleSwashDistance(waves, time + derivativeStep, runupDistance) -
    sampleSwashDistance(waves, time - derivativeStep, runupDistance)
  ) / (derivativeStep * 2) : 0;
  return {
    cycle: sequence.cycle,
    cycleSpeed: Math.max(finiteOr(waves?.[0]?.omega, 0), 0) / (Math.PI * 2),
    edgeShape: sampleSwashEventShape(sequence.index),
    eventIndex: sequence.index,
    progress,
    progressSpeed,
    edgeDistance,
    edgeDistanceSpeed,
  };
}

/**
 * World-anchored persistent wetness/foam field for a shoreline band.
 *
 * The region is independent from WaterRippleSimulation's camera-following
 * window. Example:
 *
 *   new WaterShoreStateField({
 *     region: { centerX: 0, centerZ: 0, width: 180, depth: 32 },
 *     resolution: { x: 512, y: 96 },
 *     bedHeight: heightAt,
 *   });
 */
export class WaterShoreStateField {
  constructor({
    region = {},
    resolution = { x: 512, y: 128 },
    bedHeight = null,
    bedHeightSampler = bedHeight,
    currentField = null,
    parameters = {},
  } = {}) {
    const normalizedRegion = normalizeRegion(region);
    const normalizedResolution = normalizeResolution(resolution);
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

    this.parameters = {
      ...DEFAULT_PARAMETERS,
      baseCurrent: [...DEFAULT_PARAMETERS.baseCurrent],
    };
    this.targets = [this.createTarget(), this.createTarget()];
    this.readIndex = 0;
    this.timeAccumulator = 0;
    this.needsClear = true;
    this.disposed = false;
    this.bedHeightSampler = null;
    this.bedTexture = null;
    this.bedHeightData = null;
    this.bedValidityData = null;
    this.bedTextureData = null;
    this.currentField = null;
    this.eventOffsetScratch = new THREE.Vector2();

    this.material = createWaterShoreStateSimulationNodeMaterial({
      resolutionX: this.resolutionX,
      resolutionY: this.resolutionY,
    });
    this.material.uniforms.uRegion.value.copy(this.region);

    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeometry, this.material);
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);

    this.setParameters(parameters);
    this.setCurrentField(currentField);
    this.setBedHeightSampler(bedHeightSampler);
  }

  createTarget() {
    const target = new THREE.WebGLRenderTarget(this.resolutionX, this.resolutionY, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    target.texture.name = 'waterShoreState';
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }

  get texture() {
    return this.targets[this.readIndex].texture;
  }

  get texelSize() {
    return this.material.uniforms.uTexel.value;
  }

  getRegion(out = new THREE.Vector4()) {
    return out.copy(this.region);
  }

  setParameters(parameters = {}) {
    for (const key of Object.keys(NUMERIC_PARAMETER_UNIFORMS)) {
      if (!Number.isFinite(Number(parameters[key]))) continue;
      const isTime = key.endsWith('Time') || key.endsWith('Lifetime');
      const minimum = isTime || key === 'noiseScale' ? 1e-3 : 0;
      this.parameters[key] = Math.max(Number(parameters[key]), minimum);
    }
    if (parameters.baseCurrent !== undefined) {
      const [x, z] = vector2Components(parameters.baseCurrent);
      this.parameters.baseCurrent = [x, z];
    }

    const uniforms = this.material?.uniforms;
    if (uniforms) {
      for (const [key, uniformName] of Object.entries(NUMERIC_PARAMETER_UNIFORMS)) {
        uniforms[uniformName].value = this.parameters[key];
      }
      uniforms.uBaseCurrent.value.set(...this.parameters.baseCurrent);
    }
    return this;
  }

  // Binds the compact RGBA8 velocity atlas produced by WaterCurrentField.
  // The field remains caller-owned; this class only reads its texture and
  // mirrors region/encoding uniforms before each update.
  setCurrentField(currentField) {
    if (currentField != null && currentField.isWaterCurrentField !== true) {
      throw new TypeError('WaterShoreStateField currentField must be a WaterCurrentField or null.');
    }
    this.currentField = currentField ?? null;
    this.syncCurrentFieldUniforms();
    return this;
  }

  syncCurrentFieldUniforms() {
    const uniforms = this.material?.uniforms;
    if (!uniforms) return this;
    if (!this.currentField) {
      uniforms.uUseCurrentMap.value = 0;
      return this;
    }
    uniforms.uCurrentMap.value = this.currentField.texture;
    uniforms.uUseCurrentMap.value = 1;
    uniforms.uCurrentMaxSpeed.value = this.currentField.maxSpeed;
    uniforms.uCurrentStrength.value = this.currentField.strength;
    this.currentField.getRegion(uniforms.uCurrentRegion.value);
    return this;
  }

  createBedTexture(sampler) {
    const width = this.resolutionX;
    const height = this.resolutionY;
    const count = width * height;
    const heights = this.bedHeightData?.length === count
      ? this.bedHeightData
      : new Float32Array(count);
    const valid = this.bedValidityData?.length === count
      ? this.bedValidityData
      : new Uint8Array(count);
    heights.fill(0);
    valid.fill(0);
    this.bedHeightData = heights;
    this.bedValidityData = valid;
    const worldStepX = this.worldWidth / width;
    const worldStepZ = this.worldDepth / height;
    const minX = this.centerX - this.worldWidth * 0.5;
    const minZ = this.centerZ - this.worldDepth * 0.5;

    if (sampler) {
      for (let y = 0; y < height; y += 1) {
        const worldZ = minZ + (y + 0.5) * worldStepZ;
        for (let x = 0; x < width; x += 1) {
          const worldX = minX + (x + 0.5) * worldStepX;
          const index = y * width + x;
          const value = Number(sampler(worldX, worldZ));
          if (Number.isFinite(value)) {
            heights[index] = value;
            valid[index] = 1;
          }
        }
      }
    }

    const data = this.bedTextureData?.length === count * 4
      ? this.bedTextureData
      : new Float32Array(count * 4);
    data.fill(0);
    this.bedTextureData = data;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      const downRow = Math.max(y - 1, 0) * width;
      const upRow = Math.min(y + 1, height - 1) * width;
      for (let x = 0; x < width; x += 1) {
        const index = row + x;
        const destination = index * 4;
        if (!valid[index]) continue;
        const center = heights[index];
        const leftIndex = row + Math.max(x - 1, 0);
        const rightIndex = row + Math.min(x + 1, width - 1);
        const downIndex = downRow + x;
        const upIndex = upRow + x;
        const leftValid = valid[leftIndex] === 1;
        const rightValid = valid[rightIndex] === 1;
        const downValid = valid[downIndex] === 1;
        const upValid = valid[upIndex] === 1;
        const gradientX = leftValid && rightValid
          ? (heights[rightIndex] - heights[leftIndex]) /
            (worldStepX * (x > 0 && x < width - 1 ? 2 : 1))
          : rightValid ? (heights[rightIndex] - center) / worldStepX
            : leftValid ? (center - heights[leftIndex]) / worldStepX : 0;
        const gradientZ = downValid && upValid
          ? (heights[upIndex] - heights[downIndex]) /
            (worldStepZ * (y > 0 && y < height - 1 ? 2 : 1))
          : upValid ? (heights[upIndex] - center) / worldStepZ
            : downValid ? (center - heights[downIndex]) / worldStepZ : 0;
        data[destination] = center;
        data[destination + 1] = gradientX;
        data[destination + 2] = gradientZ;
        data[destination + 3] = 1;
      }
    }

    // Preserve one texture object across terrain switches. Updating its CPU
    // data in-place avoids both the large retired-texture queue and
    // the WebGPU lifetime race caused by disposing a texture still referenced
    // by the current command encoder.
    const texture = this.bedTexture ?? new THREE.DataTexture(
      data, width, height, THREE.RGBAFormat, THREE.FloatType,
    );
    texture.image.data = data;
    texture.image.width = width;
    texture.image.height = height;
    texture.name = 'waterShoreBedField';
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    // This atlas has exactly the state-pass resolution and is sampled at its
    // texel centers. Nearest filtering avoids requiring float-linear texture
    // support on the forced-WebGL2 fallback without changing the result.
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  // A bed replacement is a topology change: rebuild the static atlas and
  // clear temporal state on the next renderer update. Water-level changes do
  // not call this and therefore preserve tide marks.
  setBedHeightSampler(bedHeightSampler) {
    if (bedHeightSampler != null && typeof bedHeightSampler !== 'function') {
      throw new TypeError('WaterShoreStateField bedHeightSampler must be a function or null.');
    }
    const nextTexture = this.createBedTexture(bedHeightSampler ?? null);
    this.bedTexture = nextTexture;
    this.bedHeightSampler = bedHeightSampler ?? null;
    this.material.uniforms.uBedMap.value = nextTexture;
    this.readIndex = 0;
    this.timeAccumulator = 0;
    this.needsClear = true;
    return this;
  }

  clearTargets(renderer) {
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const target of this.targets) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    this.readIndex = 0;
    this.needsClear = false;
  }

  writeStaticUniforms({ waterLevel, settings = {}, waveEnergy } = {}) {
    this.syncCurrentFieldUniforms();
    const uniforms = this.material.uniforms;
    const resolvedEnergy = Number.isFinite(Number(waveEnergy))
      ? Math.max(Number(waveEnergy), 0)
      : waveEnergyFrom(settings.waves);
    const explicitRunup = finiteOr(settings.runupDistance, 0) > 0.01;
    const shorelineRunup = Math.max(finiteOr(settings.shorelineRunup, 0.6), 0);
    uniforms.uWaterLevel.value = finiteOr(waterLevel, 0);
    uniforms.uExplicitRunup.value = explicitRunup ? 1 : 0;
    uniforms.uShorelineRunup.value = shorelineRunup;
    uniforms.uWaveEnergy.value = resolvedEnergy;
    uniforms.uSwashEnabled.value = this.bedHeightSampler &&
      (explicitRunup || shorelineRunup * resolvedEnergy > 1e-4) ? 1 : 0;
    // Appearance gain is applied once in the visible water material. Feeding
    // it into temporal injection as well squared the setting and saturated a
    // multi-metre white carpet after only a few updates.
    uniforms.uFoamAmount.value = 1;
    const authoredNoiseScale = Math.max(finiteOr(settings.foamNoiseScale, 0.6), 0.01);
    uniforms.uNoiseScale.value = this.parameters.noiseScale * THREE.MathUtils.clamp(
      authoredNoiseScale / 0.6,
      0.35,
      3,
    );
  }

  writeFrameUniforms({
    time,
    waves = [],
    settings = {},
    swashFrame = null,
  }, sampleTime) {
    const runupDistance = Math.max(finiteOr(settings.runupDistance, 0), 0);
    const fallback = buildFallbackSwashFrame(waves, sampleTime, runupDistance);
    const timeOffset = sampleTime - finiteOr(time, sampleTime);
    const progressSpeed = finiteOr(swashFrame?.progressSpeed, fallback.progressSpeed);
    const edgeDistanceSpeed = finiteOr(
      swashFrame?.edgeDistanceSpeed ?? swashFrame?.edgeSpeed,
      fallback.edgeDistanceSpeed,
    );
    const progress = swashFrame
      ? THREE.MathUtils.clamp(
        finiteOr(swashFrame.progress, fallback.progress) + progressSpeed * timeOffset,
        0,
        1,
      )
      : fallback.progress;
    const edgeDistance = swashFrame
      ? finiteOr(swashFrame.edgeDistance, fallback.edgeDistance) + edgeDistanceSpeed * timeOffset
      : fallback.edgeDistance;
    const eventIndex = Math.floor(finiteOr(swashFrame?.eventIndex, fallback.eventIndex));
    const cycleSpeed = finiteOr(swashFrame?.cycleSpeed, fallback.cycleSpeed);
    const cycle = (
      finiteOr(swashFrame?.cycle, fallback.cycle) + cycleSpeed * timeOffset
    ) % 1;
    const edgeShape = swashFrame?.edgeShape ?? fallback.edgeShape;

    const primary = waves?.[0];
    const authoredDirection = swashFrame?.primaryDirection ??
      (primary ? [primary.dirX, primary.dirZ] : settings.waveDirection);
    const [directionX, directionZ] = vector2Components(authoredDirection, 1, 0);
    const directionLength = Math.hypot(directionX, directionZ) || 1;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = sampleTime;
    uniforms.uSwashCycle.value = cycle < 0 ? cycle + 1 : cycle;
    uniforms.uSwashCycleSpeed.value = cycleSpeed;
    uniforms.uSwashProgress.value = progress;
    uniforms.uSwashProgressSpeed.value = progressSpeed;
    uniforms.uSwashEdgeDistance.value = edgeDistance;
    uniforms.uSwashEdgeSpeed.value = edgeDistanceSpeed;
    uniforms.uPrimaryDirection.value.set(
      directionX / directionLength,
      directionZ / directionLength,
    );
    uniforms.uSwashEdgeShape.value.set(
      finiteOr(edgeShape?.phase, 0),
      finiteOr(edgeShape?.frequency, 0.1),
      finiteOr(edgeShape?.amplitude, 0),
    );
    if (swashFrame?.noiseOffset !== undefined) {
      const [x, y] = vector2Components(swashFrame.noiseOffset);
      uniforms.uEventNoiseOffset.value.set(x, y);
    } else {
      eventNoiseOffset(eventIndex, this.eventOffsetScratch);
      uniforms.uEventNoiseOffset.value.copy(this.eventOffsetScratch);
    }
  }

  step(renderer) {
    const uniforms = this.material.uniforms;
    uniforms.uPrevState.value = this.targets[this.readIndex].texture;
    const writeTarget = this.targets[1 - this.readIndex];
    renderer.setRenderTarget(writeTarget);
    renderer.render(this.fullscreenScene, this.fullscreenCamera);
    this.readIndex = 1 - this.readIndex;
  }

  /**
   * Advances the field. `swashFrame` is optional; when omitted, the class
   * derives it from the same public waterSettings helpers used by WaterSurface.
   */
  update(renderer, {
    time = 0,
    waterLevel = 0,
    waves = [],
    settings = {},
    waveEnergy = undefined,
    swashFrame = null,
  } = {}, delta = 0) {
    if (this.disposed) return this;
    if (!renderer) throw new TypeError('WaterShoreStateField.update requires a renderer.');
    if (this.needsClear) this.clearTargets(renderer);

    this.timeAccumulator += Math.min(Math.max(finiteOr(delta, 0), 0), 0.1);
    let substeps = Math.floor(this.timeAccumulator / FIXED_TIMESTEP);
    if (substeps <= 0) return this;
    substeps = Math.min(substeps, MAX_SUBSTEPS_PER_FRAME);
    this.timeAccumulator = Math.max(
      0,
      Math.min(this.timeAccumulator - substeps * FIXED_TIMESTEP, FIXED_TIMESTEP),
    );

    this.writeStaticUniforms({ waterLevel, settings: { ...settings, waves }, waveEnergy });
    this.material.uniforms.uDelta.value = FIXED_TIMESTEP;

    const previousTarget = renderer.getRenderTarget();
    const previousXrEnabled = renderer.xr?.enabled;
    if (renderer.xr) renderer.xr.enabled = false;
    try {
      for (let i = 0; i < substeps; i += 1) {
        const sampleTime = finiteOr(time, 0) - (substeps - 1 - i) * FIXED_TIMESTEP;
        this.writeFrameUniforms({ time, waves, settings, swashFrame }, sampleTime);
        this.step(renderer);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      if (renderer.xr && previousXrEnabled !== undefined) renderer.xr.enabled = previousXrEnabled;
    }
    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const target of this.targets) target.dispose();
    this.bedTexture?.dispose();
    this.material.dispose();
    this.quadGeometry.dispose();
    this.fullscreenScene.remove(this.quad);
  }
}
