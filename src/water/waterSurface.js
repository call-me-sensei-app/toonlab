import * as THREE from 'three';

import { updateProjectedWaterCaustics } from '../shaders-tsl/chunks/projected-water-caustics.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { resolveWaterQualityOptions } from '../styles/sceneQualityProfiles.js';

import {
  applyWaterSettingsToMaterial,
  createWaterMaterial,
  setWaterDebugMode,
  updateWaterMaterialCamera,
} from './waterMaterial.js';
import { WaterDynamics } from './waterDynamics.js';
import { WaterCurrentField } from './waterCurrentField.js';
import {
  buildNearshorePhaseField,
  sampleNearshorePhaseField,
} from './waterNearshorePhase.js';
import { shouldUseDedicatedBreakerShell, WaterBreakerSystem } from './waterBreakerSystem.js';
import { WaterInteractionManager } from './waterInteraction.js';
import { WaterRippleSimulation } from './waterRippleSimulation.js';
import { WaterScenePasses } from './waterScenePasses.js';
import { WaterShoreStateField } from './waterShoreStateField.js';
import { updateWaterShoreMaterial } from './waterShoreMaterial.js';
import { WaterSplashSystem } from './waterSplashSystem.js';
import { WaterUnderwaterAtmosphere } from './waterUnderwaterAtmosphere.js';
import {
  WATER_SCENE_OVERRIDE_KEYS,
  WATER_SCENE_OVERRIDE_PRIORITIES,
} from './sceneOverrideLayers.js';
import {
  createWaterSettings,
  rebaseWaterSettingsStyle,
  sampleGerstnerHeight,
  sampleSwashEdgeOffset,
  sampleSwashFrameState,
} from './waterSettings.js';

const worldPositionScratch = new THREE.Vector3();
const localScratch = new THREE.Vector3();
const breakerSampleScratch = { weight: 0, crestY: 0, flowX: 0, flowZ: 0 };
const followScratch = new THREE.Vector3();
const currentSampleScratch = new THREE.Vector2();

const waterSceneOverrideKeySet = new Set(WATER_SCENE_OVERRIDE_KEYS);

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...value };
  return value;
}

function collectWaterSceneOverrides(options) {
  return Object.fromEntries(
    Object.entries(cleanObject(options))
      .filter(([key, value]) => waterSceneOverrideKeySet.has(key) && value !== undefined)
      .map(([key, value]) => [key, cloneValue(value)]),
  );
}

function disposeAfterRenderBoundary(disposable) {
  const dispose = () => disposable.dispose();
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.setTimeout(dispose, 34);
    return;
  }
  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(dispose);
  });
}

function createWaterVolumeGeometry(width, depth, volumeDepth) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const bottom = -volumeDepth;
  const positions = new Float32Array([
    // front
    -halfWidth, 0, halfDepth, halfWidth, bottom, halfDepth, halfWidth, 0, halfDepth,
    -halfWidth, 0, halfDepth, -halfWidth, bottom, halfDepth, halfWidth, bottom, halfDepth,
    // back
    halfWidth, 0, -halfDepth, halfWidth, bottom, -halfDepth, -halfWidth, 0, -halfDepth,
    -halfWidth, 0, -halfDepth, halfWidth, bottom, -halfDepth, -halfWidth, bottom, -halfDepth,
    // left
    -halfWidth, 0, -halfDepth, -halfWidth, bottom, -halfDepth, -halfWidth, 0, halfDepth,
    -halfWidth, 0, halfDepth, -halfWidth, bottom, -halfDepth, -halfWidth, bottom, halfDepth,
    // right
    halfWidth, 0, halfDepth, halfWidth, bottom, halfDepth, halfWidth, 0, -halfDepth,
    halfWidth, 0, -halfDepth, halfWidth, bottom, halfDepth, halfWidth, bottom, -halfDepth,
    // bottom
    -halfWidth, bottom, halfDepth, halfWidth, bottom, -halfDepth, -halfWidth, bottom, -halfDepth,
    -halfWidth, bottom, halfDepth, halfWidth, bottom, halfDepth, halfWidth, bottom, -halfDepth,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// All-in-one stylized water body: surface mesh + material, GPU ripple
// simulation, splash particles, interaction tracking, and the scene passes
// that feed refraction/reflection. One update() call per frame drives
// everything:
//
//   const water = new WaterSurface({ width: 18, depth: 22, preset: 'lake' });
//   water.position.y = 0.36;
//   scene.add(water);
//   ...
//   water.update(renderer, scene, camera, delta);  // before renderer.render
//
// The surface must stay axis-aligned (translation only); rotating the water
// plane is not supported by the interaction/reflection math.
export class WaterSurface extends THREE.Mesh {
  constructor({
    width = 20,
    depth = 20,
    segmentsPerMeter = 5,
    maxSegments = 380,
    sceneQuality = 'balanced',
    simulation = {},
    splashes = {},
    passes = {},
    interaction = {},
    currentField = null,
    dynamics = null,
    nearshorePhase = false,
    shoreState = false,
    underwaterAtmosphere = true,
    follow = null,
    bedHeight = null,
    volumeDepth = 6,
    volumeOpacity = 0.68,
    styleTarget = {},
    ...settingsOptions
  } = {}) {
    const settings = createWaterSettings(settingsOptions);
    const segmentsX = dynamics ? (dynamics.columns ?? 96) - 1 : Math.min(maxSegments, Math.max(16, Math.round(width * segmentsPerMeter)));
    const segmentsZ = dynamics ? (dynamics.rows ?? 96) - 1 : Math.min(maxSegments, Math.max(16, Math.round(depth * segmentsPerMeter)));
    const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    geometry.rotateX(-Math.PI / 2);

    // `shoaling` is the WATER_SHOALING signal for the TSL factory branch
    // (graph shape must be known at creation); createWaterSettings drops the
    // key, so the classic ShaderMaterial path is untouched by it.
    super(geometry, createWaterMaterial(
      { ...settings, shoaling: typeof bedHeight === 'function', dynamics: Boolean(dynamics) },
    ));
    this.name = 'WaterSurface';
    markFactoryStyleMaterial(this.material, 'WaterSurface');
    this.settings = this.material.userData.waterSettings;
    const resolvedVolumeDepth = Math.max(Number(volumeDepth) || 0, 0);
    this.volumeSkirt = null;
    if (resolvedVolumeDepth > 0) {
      const deepColor = this.settings.deepColor ?? [0.018, 0.22, 0.4];
      const volumeMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(deepColor[0], deepColor[1], deepColor[2]),
        depthWrite: false,
        opacity: THREE.MathUtils.clamp(Number(volumeOpacity) || 0, 0, 1),
        side: THREE.DoubleSide,
        transparent: true,
      });
      volumeMaterial.name = 'WaterVolumeSkirt';
      markFactoryStyleMaterial(volumeMaterial, 'WaterVolumeSkirt');
      const volume = new THREE.Mesh(
        createWaterVolumeGeometry(width, depth, resolvedVolumeDepth),
        volumeMaterial,
      );
      volume.name = 'WaterVolumeSkirt';
      volume.castShadow = false;
      volume.receiveShadow = true;
      volume.renderOrder = -1;
      volume.userData.waterExclude = true;
      this.add(volume);
      this.volumeSkirt = volume;
    }
    this.width = width;
    this.depth = depth;
    this.segmentsX = segmentsX;
    this.segmentsZ = segmentsZ;
    this._authoredQualityRequest = settingsOptions.quality && typeof settingsOptions.quality === 'object'
      ? { ...settingsOptions.quality }
      : this.settings.quality;
    this._sceneOverrideLayers = new Map();
    this._sceneOverrideSequence = 0;
    this._sceneOverrides = {};
    this.time = 0;
    this.followTarget = follow;
    // Displaced waves escape the flat-plane bounds; skip culling entirely.
    this.frustumCulled = false;
    // Scene shadows from rocks, trees, and the character darken the surface.
    this.receiveShadow = true;
    // Default scene adapter: restore the host's air scene for transmission /
    // reflection captures, then apply Water Lab's proven body-color fog and
    // background when the main camera is below this finite water surface.
    this.underwaterAtmosphere = new WaterUnderwaterAtmosphere(underwaterAtmosphere);
    this.underwaterAtmosphereState = this.underwaterAtmosphere.state;

    // Optional terrain sampler (x, z) => world-space bed height. Enables
    // shoaling: waves flatten in shallow water instead of clipping through
    // shores/islands. Vertex bed heights bake in update() and re-bake
    // whenever the surface's world XZ moves (>5cm) from where it was baked —
    // immune to first-frame ordering races where the mesh isn't positioned
    // yet. The terrain itself is assumed static.
    this.shoalingEnabled = typeof bedHeight === 'function';
    this.bedHeightSampler = this.shoalingEnabled ? bedHeight : null;
    this.shoalingBakedX = NaN;
    this.shoalingBakedY = NaN;
    this.shoalingBakedZ = NaN;
    // Optional mild-slope phase refraction for the primary swell and a true
    // same-direction set-beat partner when that feature is enabled.
    // The graph always reads aNearshorePhase on shoaling surfaces, so even a
    // disabled/unsupported stage receives a disabled fallback attribute.
    const nearshoreOptions = nearshorePhase === true ? {} : nearshorePhase;
    this.nearshorePhaseEnabled = Boolean(this.shoalingEnabled && nearshoreOptions);
    this.nearshorePhaseOptions = this.nearshorePhaseEnabled
      ? { ...nearshoreOptions }
      : null;
    this.nearshorePhaseField = null;
    this.nearshorePhaseBakedSignature = '';
    this.nearshorePhaseReference = null;
    this.nearshorePhaseSample = {};
    this.nearshorePhaseStatus = {
      active: false,
      reason: this.nearshorePhaseEnabled ? 'not-baked' : 'disabled',
    };
    if (this.shoalingEnabled) this.writeNearshorePhaseAttribute(null);
    // Dedicated plunging-breaker shells along the break line; created lazily
    // in update() when settings.breakerAmount > 0 and a bed sampler exists.
    this.breakers = null;
    this.breakerBuilt = { x: NaN, y: NaN, z: NaN, energy: NaN };
    if (this.bedHeightSampler) {
      this.material.defines = { ...this.material.defines, WATER_SHOALING: 1 };
    }

    this.simulationEnabled = simulation !== false && !dynamics;
    this.ripples = this.simulationEnabled
      ? new WaterRippleSimulation({
        resolution: simulation.resolution ?? 256,
        worldWidth: Math.min(simulation.worldSize ?? width, width),
        worldDepth: Math.min(simulation.worldSize ?? depth, depth),
      })
      : null;

    this.splashesEnabled = splashes !== false;
    this.splashSystem = this.splashesEnabled
      ? new WaterSplashSystem({ ...(splashes || {}), settings: this.settings })
      : null;
    if (this.splashSystem) {
      this.add(this.splashSystem);
      markFactoryStyleMaterial(this.splashSystem.dropletMaterial, 'WaterSplashDroplets');
      // Foam rings evaluate the same Gerstner stack to drape over the swell.
      this.splashSystem.attachWaveUniforms(this.material);
      markFactoryStyleMaterial(this.splashSystem.sheetMaterial, 'WaterSplashSheets');
    }

    attachFactoryStyleTarget(this, 'water', {
      targetId: 'toonlab/water',
      ...styleTarget,
      materials: {
        assignments: {
          WaterSurface: { roles: ['water'] },
          ...(this.volumeSkirt ? { WaterVolumeSkirt: { roles: ['water'] } } : {}),
          ...(this.splashSystem ? {
            WaterSplashDroplets: { roles: ['water'] },
            WaterSplashSheets: { roles: ['water'] },
          } : {}),
        },
        ...(styleTarget.materials ?? {}),
      },
    });

    this.passesEnabled = passes !== false;
    this.passes = this.passesEnabled
      ? new WaterScenePasses({
        ...(sceneQuality === null ? {} : resolveWaterQualityOptions(sceneQuality)),
        ...(passes || {}),
      })
      : null;

    this.interactions = new WaterInteractionManager(this, interaction || {});

    // Optional authored world-space current atlas. Passing a WaterCurrentField
    // shares external ownership; passing an options object creates a field
    // owned by this surface. Currents feed CPU gameplay queries and the small
    // shoreline-state pass, not the private-memory-heavy main water shader.
    const currentFieldOptions = currentField === true ? {} : currentField;
    this.ownsCurrentField = Boolean(
      currentFieldOptions && !currentFieldOptions.isWaterCurrentField,
    );
    this.currentField = currentFieldOptions?.isWaterCurrentField
      ? currentFieldOptions
      : currentFieldOptions
        ? new WaterCurrentField({
          region: { centerX: 0, centerZ: 0, width, depth },
          ...currentFieldOptions,
        })
        : null;

    // Persistent beach history is opt-in because rivers/open-water bodies do
    // not all need a fixed shoreline atlas. It is a separate small GPU pass,
    // so foam transport and wet-sand memory do not enlarge the already-dense
    // main water material (important for WebGPU's private-memory limit).
    const shoreStateOptions = shoreState === true ? {} : shoreState;
    this.shoreState = !dynamics && this.bedHeightSampler && shoreStateOptions
      ? new WaterShoreStateField({
        region: {
          centerX: 0,
          centerZ: 0,
          width,
          depth,
        },
        bedHeightSampler: this.bedHeightSampler,
        currentField: this.currentField,
        ...(shoreStateOptions || {}),
      })
      : null;
    this.shoreStateMaterials = new Set();

    this.dynamics = dynamics ? new WaterDynamics(this, dynamics) : null;
    this.syncSimulationParameters();
    this.bindShoreState();
  }

  get gerstnerWaves() {
    return this.material.userData.gerstnerWaves ?? [];
  }

  dominantNearshoreFrame() {
    const primary = this.gerstnerWaves[0];
    const secondary = this.gerstnerWaves[1];
    const directionLength = Math.hypot(primary?.dirX ?? 0, primary?.dirZ ?? 0) || 1;
    const secondaryDirectionLength = Math.hypot(
      secondary?.dirX ?? 0,
      secondary?.dirZ ?? 0,
    ) || 1;
    const directionAgreement = primary && secondary
      ? (
        (primary.dirX * secondary.dirX + primary.dirZ * secondary.dirZ) /
        (directionLength * secondaryDirectionLength)
      )
      : -1;
    // The authored set-beat partner copies the primary direction exactly.
    // Leave a tiny tolerance for serialization/normalization roundoff, but do
    // not fold an ordinary spread-spectrum slot into the shared phase field.
    const secondarySharesPhase = (this.settings.waveSetStrength ?? 0) > 0.001 &&
      directionAgreement >= 0.9999;
    const waves = secondarySharesPhase ? [primary, secondary] : [primary];
    let weightedWaveNumber = 0;
    let totalWeight = 0;
    for (const wave of waves) {
      const weight = Math.max(Math.abs(Number(wave?.amplitude) || 0), 1e-6);
      const waveNumber = Number(wave?.waveNumber);
      if (!(waveNumber > 0)) continue;
      weightedWaveNumber += waveNumber * weight;
      totalWeight += weight;
    }
    return {
      directionX: (primary?.dirX ?? 1) / directionLength,
      directionZ: (primary?.dirZ ?? 0) / directionLength,
      deepWaveNumber: totalWeight > 0
        ? weightedWaveNumber / totalWeight
        : Math.max(Number(primary?.waveNumber) || 1, 1e-4),
      slotMask: secondarySharesPhase ? 2 : 1,
    };
  }

  nearshorePhaseSignature() {
    const frame = this.dominantNearshoreFrame();
    const options = this.nearshorePhaseOptions ?? {};
    const dedicatedBreakers = shouldUseDedicatedBreakerShell(
      this.settings,
      Boolean(this.bedHeightSampler),
    );
    const solvesField = this.nearshorePhaseEnabled && !dedicatedBreakers;
    return [
      this.nearshorePhaseEnabled ? 1 : 0,
      dedicatedBreakers ? 1 : 0,
      frame.directionX,
      frame.directionZ,
      solvesField ? frame.slotMask : 0,
      solvesField ? frame.deepWaveNumber : '',
      solvesField ? options.incidentAxis ?? '' : '',
      solvesField ? options.minDepth ?? '' : '',
      solvesField ? options.maxWavenumberRatio ?? '' : '',
    ].join('|');
  }

  // Writes packed q,dq/dx,dq/dz,slot-mask vertex data. A null field clears the
  // mask, making the shader path an exact no-op for every wave
  // direction on non-beach stages and whenever the mild-slope solve is unsafe.
  writeNearshorePhaseAttribute(field) {
    if (!this.shoalingEnabled) return this;
    this.updateWorldMatrix(true, false);
    const position = this.geometry.attributes.position;
    const existing = this.geometry.attributes.aNearshorePhase;
    const packed = existing?.count === position.count && existing.itemSize === 4
      ? existing.array
      : new Float32Array(position.count * 4);
    const frame = this.dominantNearshoreFrame();
    for (let index = 0; index < position.count; index += 1) {
      localScratch.fromBufferAttribute(position, index).applyMatrix4(this.matrixWorld);
      if (field) {
        packed[index * 4] = field.phaseCoordinate[index];
        packed[index * 4 + 1] = field.waveVector[index * 2];
        packed[index * 4 + 2] = field.waveVector[index * 2 + 1];
        packed[index * 4 + 3] = field.slotMask ?? frame.slotMask;
      } else {
        packed[index * 4] = frame.directionX * localScratch.x +
          frame.directionZ * localScratch.z;
        packed[index * 4 + 1] = frame.directionX;
        packed[index * 4 + 2] = frame.directionZ;
        packed[index * 4 + 3] = 0;
      }
    }
    if (existing?.array === packed) {
      existing.needsUpdate = true;
    } else {
      this.geometry.setAttribute('aNearshorePhase', new THREE.BufferAttribute(packed, 4));
    }

    this.nearshorePhaseReference = null;
    if (field) {
      const options = this.nearshorePhaseOptions ?? {};
      const referenceX = Number.isFinite(options.referenceX) ? options.referenceX : 0;
      const referenceZ = Number.isFinite(options.referenceZ) ? options.referenceZ : 0;
      const sample = sampleNearshorePhaseField(field, referenceX, referenceZ, {});
      const directionLength = Math.hypot(sample.waveVectorX, sample.waveVectorZ) || 1;
      this.nearshorePhaseReference = {
        phaseCoordinate: sample.phaseCoordinate,
        directionX: sample.waveVectorX / directionLength,
        directionZ: sample.waveVectorZ / directionLength,
        x: referenceX,
        z: referenceZ,
      };
    }
    return this;
  }

  nearshoreBlendAt(restDepth) {
    if (!this.nearshorePhaseField) return 0;
    const range = Math.max(
      this.settings.shoalingDepth ?? 1.4,
      Math.max(this.waveEnergy, 1e-3) * 2.2,
      1e-3,
    );
    return 1 - THREE.MathUtils.smoothstep(restDepth, range * 0.8, range * 1.8);
  }

  sampleNearshoreAt(x, z, restDepth) {
    const blend = this.nearshoreBlendAt(restDepth);
    if (!(blend > 0)) return null;
    const sample = sampleNearshorePhaseField(
      this.nearshorePhaseField,
      x,
      z,
      this.nearshorePhaseSample,
    );
    sample.blend = blend;
    sample.slotMask = this.nearshorePhaseField.slotMask ?? 1;
    return sample;
  }

  nearshoreSwashTime(time = this.time) {
    const primary = this.gerstnerWaves[0];
    const coordinate = this.nearshorePhaseReference?.phaseCoordinate;
    if (!primary || !Number.isFinite(coordinate) || !(primary.omega > 1e-6)) return time;
    return time - (primary.waveNumber * coordinate) / primary.omega;
  }

  sampleSwashFrame(time = this.time, runupDistance = this.settings.runupDistance) {
    const frame = sampleSwashFrameState(
      this.gerstnerWaves,
      this.nearshoreSwashTime(time),
      runupDistance,
    );
    const reference = this.nearshorePhaseReference;
    if (reference) {
      frame.primaryDirectionX = reference.directionX;
      frame.primaryDirectionZ = reference.directionZ;
      frame.primaryDirection = [reference.directionX, reference.directionZ];
    }
    return frame;
  }

  syncSimulationParameters() {
    this.ripples?.setParameters({
      rippleDamping: this.settings.rippleDamping,
      ripplePropagation: this.settings.ripplePropagation,
      rippleFoamDecay: this.settings.rippleFoamDecay,
      rippleFoamGain: this.settings.rippleFoamGain,
    });
    this.shoreState?.setParameters({
      moistureDryTime: this.settings.wetSandDryTime,
      foamWetLifetime: this.settings.swashFoamLifetime,
      foamDryLifetime: Math.max(this.settings.swashFoamLifetime * 0.45, 0.25),
      residueLifetime: this.settings.swashFoamResidueLifetime,
    });
  }

  // A ground material can consume the same ping-pong texture as the water.
  // Registering it here refreshes its texture binding immediately after every
  // state swap and before refraction/reflection scene passes are captured.
  attachShoreStateMaterial(material) {
    if (!material) return this;
    this.shoreStateMaterials.add(material);
    updateWaterShoreMaterial(material, { stateField: this.dynamics ?? this.shoreState });
    return this;
  }

  detachShoreStateMaterial(material) {
    this.shoreStateMaterials.delete(material);
    return this;
  }

  bindShoreState() {
    const uniforms = this.material.uniforms;
    if (this.dynamics) {
      uniforms.uShoreStateMap.value = this.dynamics.texture;
      uniforms.uUseShoreState.value = 1;
      this.dynamics.getRegion(uniforms.uShoreStateRegion.value);
    } else if (this.shoreState) {
      uniforms.uShoreStateMap.value = this.shoreState.texture;
      uniforms.uUseShoreState.value = 1;
      this.shoreState.getRegion(uniforms.uShoreStateRegion.value);
    } else {
      uniforms.uUseShoreState.value = 0;
    }
    for (const material of this.shoreStateMaterials ?? []) {
      updateWaterShoreMaterial(material, { stateField: this.dynamics ?? this.shoreState });
    }
    return this;
  }

  /** Settings currently uploaded after transient scene overrides. */
  get renderedSettings() {
    return this.material.userData.waterSettings;
  }

  /** Current effective transient overrides, separate from authored settings. */
  get sceneOverrides() {
    return Object.fromEntries(
      Object.entries(this._sceneOverrides).map(([key, value]) => [key, cloneValue(value)]),
    );
  }

  /** Ordered runtime layer metadata without exposing mutable layer values. */
  get sceneOverrideLayers() {
    return [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((layer) => ({ id: layer.id, priority: layer.priority }));
  }

  _composeSceneSettings() {
    let composed = createWaterSettings(this.settings);
    const layers = [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const layer of layers) {
      const source = layer.resolve
        ? layer.resolve(createWaterSettings(composed))
        : layer.settings;
      composed = createWaterSettings({
        ...composed,
        ...collectWaterSceneOverrides(source),
      });
    }
    return composed;
  }

  _applyComposedSceneSettings() {
    const composed = this._composeSceneSettings();
    this._sceneOverrides = Object.fromEntries(
      WATER_SCENE_OVERRIDE_KEYS
        .filter((key) => JSON.stringify(composed[key]) !== JSON.stringify(this.settings[key]))
        .map((key) => [key, cloneValue(composed[key])]),
    );
    applyWaterSettingsToMaterial(this.material, {
      ...composed,
      quality: this._authoredQualityRequest,
    });
    const deepColor = this.renderedSettings.deepColor ?? this.settings.deepColor;
    if (this.volumeSkirt && deepColor) {
      this.volumeSkirt.material.color.setRGB(deepColor[0], deepColor[1], deepColor[2]);
    }
    return this.renderedSettings;
  }

  // Merges option overrides into the current settings (pass { preset } to
  // switch presets while keeping explicit overrides you re-supply). This is
  // the backward-compatible authored path; scene overrides stay separate.
  applySettings(options = {}) {
    const source = cleanObject(options);
    this.settings = createWaterSettings({ ...this.settings, ...source });
    if (source.quality !== undefined) {
      this._authoredQualityRequest = source.quality && typeof source.quality === 'object'
        ? { ...source.quality }
        : this.settings.quality;
    }
    this._applyComposedSceneSettings();
    this.splashSystem?.applySettings(this.settings);
    this.syncSimulationParameters();
    return this.settings;
  }

  // Loads a preset from scratch (unlike applySettings, prior overrides drop).
  setPreset(name, overrides = {}) {
    const source = cleanObject(overrides);
    this.settings = createWaterSettings({
      preset: name,
      style: source.style ?? this.settings.style,
      ...source,
    });
    this._authoredQualityRequest = source.quality && typeof source.quality === 'object'
      ? { ...source.quality }
      : this.settings.quality;
    this._applyComposedSceneSettings();
    this.splashSystem?.applySettings(this.settings);
    this.syncSimulationParameters();
    return this.settings;
  }

  /** Applies an IP-wide style across the current asset preset and overrides. */
  setStyle(name) {
    this.settings = rebaseWaterSettingsStyle(this.settings, name);
    this._applyComposedSceneSettings();
    this.splashSystem?.applySettings(this.settings);
    this.syncSimulationParameters();
    return this.settings;
  }

  /**
   * Adds or replaces one transient runtime owner. Static layers accept only
   * {@link WATER_SCENE_OVERRIDE_KEYS}; a resolver receives the result of all
   * lower-priority layers, enabling additive weather over an authored wave
   * baseline without mutating {@link settings}.
   */
  setSceneOverrideLayer(id, optionsOrResolver = {}, {
    priority = WATER_SCENE_OVERRIDE_PRIORITIES.scene,
    replace = true,
  } = {}) {
    if ((typeof id !== 'string' || id.length === 0) && typeof id !== 'symbol') {
      throw new TypeError('A water scene override layer needs a non-empty string or Symbol id.');
    }
    const existing = this._sceneOverrideLayers.get(id);
    const resolve = typeof optionsOrResolver === 'function' ? optionsOrResolver : null;
    let settings = null;
    if (!resolve) {
      const next = collectWaterSceneOverrides(optionsOrResolver);
      settings = !replace && existing?.settings
        ? { ...existing.settings, ...next }
        : next;
    }
    this._sceneOverrideLayers.set(id, {
      id,
      order: existing?.order ?? this._sceneOverrideSequence++,
      priority: Number.isFinite(Number(priority))
        ? Number(priority)
        : WATER_SCENE_OVERRIDE_PRIORITIES.scene,
      resolve,
      settings,
    });
    return this._applyComposedSceneSettings();
  }

  /** Removes one runtime owner without disturbing other active layers. */
  clearSceneOverrideLayer(id) {
    if (!this._sceneOverrideLayers.delete(id)) return this.renderedSettings;
    return this._applyComposedSceneSettings();
  }

  /** Convenience scene layer for current wave/light state. */
  setSceneOverrides(options = {}, { replace = false } = {}) {
    return this.setSceneOverrideLayer('scene', options, {
      priority: WATER_SCENE_OVERRIDE_PRIORITIES.scene,
      replace,
    });
  }

  /** Clears only the convenience scene layer, preserving independent owners. */
  clearSceneOverrides() {
    return this.clearSceneOverrideLayer('scene');
  }

  /** Explicitly clears every transient owner and restores the authored baseline. */
  clearAllSceneOverrideLayers() {
    this._sceneOverrideLayers.clear();
    return this._applyComposedSceneSettings();
  }

  setDebugMode(mode) {
    setWaterDebugMode(this.material, mode);
    return this;
  }

  setQualityBudget(input = {}) {
    this.passes?.setQualityBudget(input.water ?? input);
    return this.passes?.stats ?? null;
  }

  // Drifting procedural cloud shadows over the surface — same field as the
  // grass/tree/terrain helpers so a passing cloud dims the scene together.
  // strength 0 (the default) disables. velocity is uv-space drift per second.
  /**
   * Exponential distance fog matching the environment shader's height fog —
   * without it, far-shore water stays bright against fogged terrain.
   * `createStylizedWorld` wires this automatically from the environment's
   * heightFog parameters. `density: 0` disables.
   */
  setDistanceFog({ color, density } = {}) {
    const uniforms = this.material.uniforms;
    if (uniforms.uDistanceFogDensity === undefined) return this;
    if (density !== undefined) uniforms.uDistanceFogDensity.value = Math.max(Number(density) || 0, 0);
    if (color !== undefined) {
      const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
      uniforms.uDistanceFogColor.value.copy(next);
    }
    return this;
  }

  setCloudShadow({ strength, coverage, scale, velocity } = {}) {
    const uniforms = this.material.uniforms;
    if (Number.isFinite(strength)) uniforms.uCloudShadowStrength.value = strength;
    if (Number.isFinite(coverage)) uniforms.uCloudShadowCoverage.value = coverage;
    if (Number.isFinite(scale)) uniforms.uCloudShadowScale.value = scale;
    if (velocity) {
      uniforms.uCloudShadowVelocity.value.set(
        velocity[0] ?? velocity.x ?? 0, velocity[1] ?? velocity.y ?? 0);
    }
    return this;
  }

  setFollowTarget(target) {
    this.followTarget = target;
    return this;
  }

  // The material graph always supports the packed attribute, so a lab can
  // opt a smooth beach in/out without recompiling WebGPU pipelines.
  setNearshorePhase(nearshorePhase, { bake = true } = {}) {
    const options = nearshorePhase === true ? {} : nearshorePhase;
    this.nearshorePhaseEnabled = Boolean(this.shoalingEnabled && options);
    this.nearshorePhaseOptions = this.nearshorePhaseEnabled ? { ...options } : null;
    this.nearshorePhaseField = null;
    this.nearshorePhaseReference = null;
    this.nearshorePhaseBakedSignature = '';
    this.nearshorePhaseStatus = {
      active: false,
      reason: this.nearshorePhaseEnabled ? 'not-baked' : 'disabled',
    };
    if (this.shoalingEnabled) {
      this.writeNearshorePhaseAttribute(null);
      if (bake && this.bedHeightSampler) this.bakeShoalingDepths();
    }
    return this;
  }

  // Replace the authored current atlas at runtime. Options objects become
  // surface-owned fields; WaterCurrentField instances remain caller-owned.
  setCurrentField(currentField, { disposePrevious = true } = {}) {
    const options = currentField === true ? {} : currentField;
    const nextOwned = Boolean(options && !options.isWaterCurrentField);
    const next = options?.isWaterCurrentField
      ? options
      : options
        ? new WaterCurrentField({
          region: { centerX: 0, centerZ: 0, width: this.width, depth: this.depth },
          ...options,
        })
        : null;
    const previous = this.currentField;
    const previousOwned = this.ownsCurrentField;
    this.currentField = next;
    this.ownsCurrentField = nextOwned;
    this.shoreState?.setCurrentField(next);
    if (disposePrevious && previousOwned && previous && previous !== next) previous.dispose();
    return this;
  }

  // Authored large-scale current only. getFlowAt() below adds breakers and
  // swash so boats/characters can choose either signal explicitly.
  getCurrentAt(x, z, out = new THREE.Vector2()) {
    if (!this.currentField) return out.set(0, 0);
    return this.currentField.sampleAt(x, z, out);
  }

  // Replace static terrain under an existing shoaling surface without
  // rebuilding its material, render passes, ripple simulation, or animation
  // clock. Whether shoaling exists is a graph-build choice, so callers cannot
  // toggle it after construction; they may freely swap one sampler for
  // another. This is useful for labs/worlds with selectable ground profiles.
  setBedHeightSampler(bedHeight, { bake = true } = {}) {
    const sampler = typeof bedHeight === 'function' ? bedHeight : null;
    if (Boolean(sampler) !== this.shoalingEnabled) {
      throw new Error(
        'WaterSurface cannot toggle shoaling after construction; create a new surface instead.',
      );
    }
    if (sampler === this.bedHeightSampler) return this;

    this.bedHeightSampler = sampler;
    this.shoreState?.setBedHeightSampler(sampler);
    this.shoalingBakedX = NaN;
    this.shoalingBakedY = NaN;
    this.shoalingBakedZ = NaN;
    this.nearshorePhaseBakedSignature = '';
    this.breakerBuilt.x = NaN;
    this.breakerBuilt.y = NaN;
    this.breakerBuilt.z = NaN;
    this.breakerBuilt.energy = NaN;
    if (this.breakers) {
      const staleBreakers = this.breakers;
      this.remove(staleBreakers);
      disposeAfterRenderBoundary(staleBreakers);
      this.breakers = null;
    }
    if (sampler && bake) this.bakeShoalingDepths();
    return this;
  }

  get waveEnergy() {
    return this.material.userData.waterWaveEnergy ?? 0.3;
  }

  // World-space wave height of the rendered Gerstner surface at (x, z).
  // Interactive ripples live on the GPU and are not included; for buoyancy
  // the analytic swell is the part that matters.
  getHeightAt(x, z) {
    this.getWorldPosition(worldPositionScratch);
    const surfaceY = worldPositionScratch.y;
    return surfaceY + this.relativeSurfaceHeightAt(x, z, surfaceY);
  }

  // Approximate CPU height relative to rest level. Mirrors vertical shoreline
  // shaping but does not invert Gerstner horizontal displacement or read GPU
  // ripples. Do not use this as an exact Eulerian contact/volume solver; see
  // docs/water.md.
  relativeSurfaceHeightAt(x, z, surfaceY) {
    if (this.dynamics?.gridSignature) return this.dynamics.sample(x, z).height - surfaceY;
    if (!this.bedHeightSampler) {
      return sampleGerstnerHeight(this.gerstnerWaves, x, z, this.time);
    }
    const settings = this.settings;
    const bed = this.bedHeightSampler(x, z);
    const restDepth = surfaceY - bed;
    const energy = Math.max(this.waveEnergy, 1e-3);
    const range = Math.max(settings.shoalingDepth ?? 1.4, energy * 2.2, 1e-3);
    // Mirror of the vertex shader's shallow-water chop filter.
    const chopWeight = THREE.MathUtils.lerp(
      0.15, 1, THREE.MathUtils.smoothstep(restDepth, range * 0.3, range * 1.4));
    const raw = sampleGerstnerHeight(
      this.gerstnerWaves,
      x,
      z,
      this.time,
      chopWeight,
      this.sampleNearshoreAt(x, z, restDepth),
    );
    const deepFactor = THREE.MathUtils.smoothstep(restDepth, 0, range);
    const rearUp = (1 - THREE.MathUtils.smoothstep(restDepth, range * 0.45, range * 1.5)) *
      THREE.MathUtils.smoothstep(restDepth, 0.05, 0.35);
    const shoal = THREE.MathUtils.lerp(settings.shorelineWaves ?? 0.35, 1, deepFactor) *
      (1 + 0.3 * rearUp);
    const targetY = raw * shoal;
    const capY = 0.72 * Math.max(restDepth, 0);
    const brokenY = Math.max(
      Math.min(targetY, capY) + Math.max(targetY - capY, 0) * 0.1,
      -Math.max(restDepth, 0) + 0.04);
    // Connected irregular swash mirror (keep in sync with water.js): event N
    // begins at event N-1's rundown endpoint, reaches its own bounded peak,
    // then drains to a new endpoint without resetting at the still-water line.
    const explicit = (settings.runupDistance ?? 0) > 0.01;
    const waves = this.gerstnerWaves;
    const d = 0.5;
    const gradX = (this.bedHeightSampler(x + d, z) - this.bedHeightSampler(x - d, z)) / (2 * d);
    const gradZ = (this.bedHeightSampler(x, z + d) - this.bedHeightSampler(x, z - d)) / (2 * d);
    const slope = Math.min(Math.hypot(gradX, gradZ), 1);
    const safeSlope = Math.max(slope, 0.005);
    const gradientLength = Math.hypot(gradX, gradZ) || 1;
    const alongCoordinate = x * (gradZ / gradientLength) - z * (gradX / gradientLength);
    const automaticDistance = (settings.shorelineRunup ?? 0.6) * energy / safeSlope;
    const maximumDistance = explicit ? settings.runupDistance : automaticDistance;
    const swashFrame = this.sampleSwashFrame(this.time, maximumDistance);
    const swashProgress = swashFrame.progress;
    const edgeDistance = explicit
      ? swashFrame.edgeDistance
      : maximumDistance * swashProgress;
    const edgeOffset = sampleSwashEdgeOffset(
      alongCoordinate,
      this.time,
      swashProgress,
      swashFrame.primaryDirectionX ?? waves[0]?.dirX ?? settings.flowDirection?.[0] ?? 0,
      swashFrame.cycle,
      swashFrame.edgeShape,
    ) * swashFrame.activity * (maximumDistance > 0 ? 1 : 0);
    const edgeHead = edgeDistance * safeSlope + edgeOffset * safeSlope;
    const filmHead = restDepth + edgeHead;
    const film = THREE.MathUtils.clamp(filmHead * 0.45 + 0.008, 0.003, 0.045);
    const filmY = Math.min(
      (bed - surfaceY) + film,
      Math.max(0.5, maximumDistance * safeSlope * 1.1),
    );
    const beach = 1 - THREE.MathUtils.smoothstep(restDepth, 0.06, 0.22);
    const base = THREE.MathUtils.lerp(brokenY, filmY, beach);

    // Breakers are physical: blend the traveling shell face over the base
    // surface so buoyant objects (and the swimmer) ride up the wave as it
    // passes and drop behind it. The blend keeps the base where the shell
    // envelope fades out, so there is never a height discontinuity.
    if (this.breakers) {
      const shell = this.breakers.sampleAt(x, z, breakerSampleScratch);
      if (shell.weight > 0.001 && shell.crestY > base) {
        return base + (shell.crestY - base) * shell.weight;
      }
    }
    return base;
  }

  // Horizontal water push velocity (m/s, world space). Breaker shells provide
  // their traveling face flow; explicit swash adds uphill uprush and downhill
  // backwash so gameplay objects move with the rendered shoreline.
  getFlowAt(x, z, out = new THREE.Vector2()) {
    if (this.dynamics?.gridSignature) {
      const sample = this.dynamics.sample(x, z);
      return out.set(sample.velocityX, sample.velocityZ);
    }
    out.set(0, 0);
    if (this.currentField) {
      this.currentField.sampleAt(x, z, currentSampleScratch);
      out.add(currentSampleScratch);
    }
    if (this.breakers) {
      const shell = this.breakers.sampleAt(x, z, breakerSampleScratch);
      out.x += shell.flowX;
      out.y += shell.flowZ;
    }
    if (this.bedHeightSampler && (this.settings.runupDistance ?? 0) > 0.01) {
      this.getWorldPosition(worldPositionScratch);
      const surfaceY = worldPositionScratch.y;
      const bed = this.bedHeightSampler(x, z);
      const restDepth = surfaceY - bed;
      const d = 0.5;
      const gradX = (this.bedHeightSampler(x + d, z) - this.bedHeightSampler(x - d, z)) / (2 * d);
      const gradZ = (this.bedHeightSampler(x, z + d) - this.bedHeightSampler(x, z - d)) / (2 * d);
      const slope = Math.max(Math.min(Math.hypot(gradX, gradZ), 1), 0.005);
      const gradientLength = Math.hypot(gradX, gradZ) || 1;
      const alongCoordinate = x * (gradZ / gradientLength) - z * (gradX / gradientLength);
      const swashFrame = this.sampleSwashFrame(this.time, this.settings.runupDistance);
      const progress = swashFrame.progress;
      const offset = sampleSwashEdgeOffset(
        alongCoordinate,
        this.time,
        progress,
        swashFrame.primaryDirectionX ?? this.gerstnerWaves[0]?.dirX ?? 0,
        swashFrame.cycle,
        swashFrame.edgeShape,
      ) * swashFrame.activity;
      const maximumDistance = this.settings.runupDistance;
      const edgeDistance = swashFrame.edgeDistance;
      const head = edgeDistance * slope + offset * slope;
      const filmHead = restDepth + head;
      const swashZone = 1 - THREE.MathUtils.smoothstep(restDepth, 0.06, 0.22);
      const wet = THREE.MathUtils.smoothstep(filmHead, -0.006, 0.025);
      if (swashZone > 0.001 && wet > 0.001) {
        const dt = 0.03;
        const totalEdgeAt = (sampleTime) => {
          const frame = this.sampleSwashFrame(sampleTime, maximumDistance);
          return frame.edgeDistance + sampleSwashEdgeOffset(
            alongCoordinate,
            sampleTime,
            frame.progress,
            frame.primaryDirectionX ?? this.gerstnerWaves[0]?.dirX ?? 0,
            frame.cycle,
            frame.edgeShape,
          ) * frame.activity;
        };
        const before = totalEdgeAt(this.time - dt);
        const after = totalEdgeAt(this.time + dt);
        const edgeSpeed = THREE.MathUtils.clamp(
          (after - before) / (2 * dt), -3.5, 3.5,
        );
        out.x += (gradX / gradientLength) * edgeSpeed * swashZone * wet;
        out.y += (gradZ / gradientLength) * edgeSpeed * swashZone * wet;
      }
    }
    return out;
  }

  // 0..1 local wave motion scale — how much of the open-water swell survives
  // at (x, z). Splash sheets use it to damp their wave-conforming drape in
  // the shallows and on the beach film.
  waveScaleAt(x, z, surfaceY) {
    if (!this.bedHeightSampler) return 1;
    const restDepth = surfaceY - this.bedHeightSampler(x, z);
    const range = Math.max(
      this.settings.shoalingDepth ?? 1.4, Math.max(this.waveEnergy, 1e-3) * 2.2, 1e-3);
    const deepFactor = THREE.MathUtils.smoothstep(restDepth, 0, range);
    const beach = 1 - THREE.MathUtils.smoothstep(restDepth, 0.06, 0.22);
    return THREE.MathUtils.lerp(this.settings.shorelineWaves ?? 0.35, 1, deepFactor) *
      (1 - beach);
  }

  // Samples the terrain under every vertex and stores it as the aBedHeight
  // attribute the vertex shader reads. update() re-runs this automatically
  // when the surface's world XZ has moved since the last bake.
  bakeShoalingDepths() {
    if (!this.bedHeightSampler) return this;
    this.updateWorldMatrix(true, false);
    this.getWorldPosition(worldPositionScratch);
    const surfaceX = worldPositionScratch.x;
    const surfaceY = worldPositionScratch.y;
    const surfaceZ = worldPositionScratch.z;
    const positionAttr = this.geometry.attributes.position;
    const existing = this.geometry.attributes.aBedHeight;
    const existingSlope = this.geometry.attributes.aBedSlope;
    const existingGradient = this.geometry.attributes.aBedGradient;
    const bedHeights = existing?.count === positionAttr.count
      ? existing.array
      : new Float32Array(positionAttr.count);
    const bedSlopes = existingSlope?.count === positionAttr.count
      ? existingSlope.array
      : new Float32Array(positionAttr.count);
    const bedGradients = existingGradient?.count === positionAttr.count
      ? existingGradient.array
      : new Float32Array(positionAttr.count * 2);
    const useDedicatedBreakers = shouldUseDedicatedBreakerShell(
      this.settings,
      Boolean(this.bedHeightSampler),
    );
    const solveNearshore = this.nearshorePhaseEnabled && !useDedicatedBreakers;
    const restDepths = solveNearshore ? new Float32Array(positionAttr.count) : null;
    const d = 0.5;
    for (let i = 0; i < positionAttr.count; i += 1) {
      localScratch.fromBufferAttribute(positionAttr, i).applyMatrix4(this.matrixWorld);
      const x = localScratch.x;
      const z = localScratch.z;
      bedHeights[i] = this.bedHeightSampler(x, z);
      if (restDepths) restDepths[i] = surfaceY - bedHeights[i];
      // Local bed gradient magnitude — converts horizontal run-up meters
      // (runupDistance) into the vertical swash reach at this vertex.
      const gradX = (this.bedHeightSampler(x + d, z) - this.bedHeightSampler(x - d, z)) / (2 * d);
      const gradZ = (this.bedHeightSampler(x, z + d) - this.bedHeightSampler(x, z - d)) / (2 * d);
      bedSlopes[i] = Math.min(Math.hypot(gradX, gradZ), 1);
      bedGradients[i * 2] = gradX;
      bedGradients[i * 2 + 1] = gradZ;
    }
    if (existing?.array === bedHeights) {
      existing.needsUpdate = true;
    } else {
      this.geometry.setAttribute('aBedHeight', new THREE.BufferAttribute(bedHeights, 1));
    }
    if (existingSlope?.array === bedSlopes) {
      existingSlope.needsUpdate = true;
    } else {
      this.geometry.setAttribute('aBedSlope', new THREE.BufferAttribute(bedSlopes, 1));
    }
    if (existingGradient?.array === bedGradients) {
      existingGradient.needsUpdate = true;
    } else {
      this.geometry.setAttribute('aBedGradient', new THREE.BufferAttribute(bedGradients, 2));
    }

    let phaseField = null;
    let phaseStatus;
    if (!this.nearshorePhaseEnabled) {
      phaseStatus = { active: false, reason: 'disabled' };
    } else if (useDedicatedBreakers) {
      // The separate overhanging shell still evaluates its original plane
      // phase. Until it can consume the same atlas, retain exact coherence by
      // falling the heightfield back rather than showing two crest clocks.
      phaseStatus = { active: false, reason: 'dedicated-breaker-shell' };
    } else if (
      (this.segmentsX + 1) * (this.segmentsZ + 1) !== positionAttr.count
    ) {
      phaseStatus = { active: false, reason: 'unexpected-geometry-grid' };
    } else {
      const frame = this.dominantNearshoreFrame();
      const options = this.nearshorePhaseOptions ?? {};
      try {
        const candidate = buildNearshorePhaseField({
          restDepths,
          columns: this.segmentsX + 1,
          rows: this.segmentsZ + 1,
          originX: surfaceX - this.width * 0.5,
          originZ: surfaceZ - this.depth * 0.5,
          stepX: this.width / this.segmentsX,
          stepZ: this.depth / this.segmentsZ,
          directionX: frame.directionX,
          directionZ: frame.directionZ,
          deepWaveNumber: frame.deepWaveNumber,
          incidentAxis: options.incidentAxis,
          minDepth: options.minDepth ?? 0.05,
          maxWavenumberRatio: options.maxWavenumberRatio ?? 4,
        });
        // A one-way eikonal solve cannot represent turning rays, diffraction,
        // or shadow zones. Invalidity propagates downstream in the builder;
        // rejecting the complete atlas avoids a phase seam where a fallback
        // cell would otherwise meet a refracted cell.
        if (candidate.invalidCount === 0) {
          candidate.slotMask = frame.slotMask;
          phaseField = candidate;
          phaseStatus = {
            active: true,
            reason: 'active',
            incidentAxis: candidate.incidentAxis,
            invalidFraction: 0,
            slotMask: candidate.slotMask,
          };
        } else {
          phaseStatus = {
            active: false,
            reason: 'invalid-mild-slope-field',
            incidentAxis: candidate.incidentAxis,
            invalidFraction: candidate.invalidFraction,
          };
        }
      } catch (error) {
        phaseStatus = {
          active: false,
          reason: 'phase-bake-error',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    this.nearshorePhaseField = phaseField;
    this.nearshorePhaseStatus = phaseStatus;
    this.writeNearshorePhaseAttribute(phaseField);
    this.nearshorePhaseBakedSignature = this.nearshorePhaseSignature();
    this.shoalingBakedX = surfaceX;
    this.shoalingBakedY = surfaceY;
    this.shoalingBakedZ = surfaceZ;
    return this;
  }

  // Lifecycle for the breaker shells: creates/disposes with the
  // breakerAmount setting and rebuilds the break line whenever the surface
  // moves or the swell energy shifts enough to relocate the collapse depth.
  updateBreakers() {
    if (this.dynamics) return;
    const enabled = shouldUseDedicatedBreakerShell(this.settings, Boolean(this.bedHeightSampler));
    if (!enabled) {
      if (this.breakers) {
        this.remove(this.breakers);
        this.breakers.dispose();
        this.breakers = null;
        this.breakerBuilt.x = NaN;
      }
      return;
    }
    if (!this.breakers) {
      this.breakers = new WaterBreakerSystem();
      this.breakers.attachWaveUniforms(this.material);
      this.add(this.breakers);
    }
    this.getWorldPosition(worldPositionScratch);
    const energy = this.waveEnergy;
    const built = this.breakerBuilt;
    const unchanged =
      Math.abs(worldPositionScratch.x - built.x) <= 0.05 &&
      Math.abs(worldPositionScratch.y - built.y) <= 0.02 &&
      Math.abs(worldPositionScratch.z - built.z) <= 0.05 &&
      Math.abs(energy - built.energy) <= 0.03;
    if (!unchanged) {
      this.breakers.rebuild({
        bedSampler: this.bedHeightSampler,
        originX: worldPositionScratch.x,
        originZ: worldPositionScratch.z,
        surfaceY: worldPositionScratch.y,
        width: this.width,
        depth: this.depth,
        settings: this.settings,
        waveEnergy: energy,
        waves: this.gerstnerWaves,
      });
      built.x = worldPositionScratch.x;
      built.y = worldPositionScratch.y;
      built.z = worldPositionScratch.z;
      built.energy = energy;
    }
    this.breakers.configure(this.settings, energy, this.gerstnerWaves);
    this.breakers.update(this.time);
  }

  containsPoint(x, z, margin = 0) {
    this.getWorldPosition(worldPositionScratch);
    return Math.abs(x - worldPositionScratch.x) <= this.width * 0.5 - margin &&
      Math.abs(z - worldPositionScratch.z) <= this.depth * 0.5 - margin;
  }

  worldToLocalPoint(worldPoint, out = localScratch) {
    this.getWorldPosition(worldPositionScratch);
    return out.set(
      (worldPoint.x ?? 0) - worldPositionScratch.x,
      (worldPoint.y ?? worldPositionScratch.y) - worldPositionScratch.y,
      (worldPoint.z ?? 0) - worldPositionScratch.z,
    );
  }

  // Composite splash at a world position: particles + a downward impulse and
  // an outward ring wave in the ripple simulation.
  splash(worldPoint, { strength = 1, radius = 0.5 } = {}) {
    this.dynamics?.impulse(worldPoint.x, worldPoint.z, strength, radius);
    const local = this.worldToLocalPoint(worldPoint);
    local.y = this.relativeSurfaceHeightAt(
      worldPoint.x ?? 0, worldPoint.z ?? 0, worldPositionScratch.y);
    this.splashSystem?.emitSplash(local, { strength });
    if (this.ripples) {
      const impulse = strength * this.settings.rippleStrength;
      this.ripples.addImpulse(worldPoint.x, worldPoint.z, {
        radius: radius,
        strength: -1.1 * impulse,
      });
      this.ripples.addRingImpulse(worldPoint.x, worldPoint.z, {
        radius: radius * 1.1,
        strength: 0.55 * impulse,
      });
    }
    return this;
  }

  // Plain ripple impulse (no particles) — wakes, rain, gentle touches.
  addRipple(worldPoint, { radius = 0.4, strength = 0.4 } = {}) {
    this.dynamics?.impulse(worldPoint.x, worldPoint.z, strength * this.settings.rippleStrength, radius);
    this.ripples?.addImpulse(worldPoint.x, worldPoint.z, {
      radius,
      strength: strength * this.settings.rippleStrength,
    });
    return this;
  }

  // Small droplet burst without rings/crown — bow spray on fast movers.
  sprayAt(worldPoint, { count = 4, strength = 0.4 } = {}) {
    if (!this.splashSystem) return this;
    const local = this.worldToLocalPoint(worldPoint);
    local.y = Math.max(local.y, 0);
    this.splashSystem.emitDroplets(local, { count, strength });
    return this;
  }

  // source: Object3D | (outVector3) => position | { getPosition }.
  addInteractor(source, options = {}) {
    return this.interactions.add(source, options);
  }

  removeInteractor(id) {
    this.interactions.remove(id);
  }

  // Hosts with buoyant actors may prepare the field before moving actors;
  // update() then captures that same field without advancing it a second time.
  prepareDynamics(delta) {
    if (this.dynamics) {
      this.dynamics.update(Math.max(0, Math.min(delta, 0.1)));
      this.time = this.dynamics.time;
      this.dynamicsPrepared = true;
      this.bindShoreState();
    }
    return this;
  }

  // Call once per frame before rendering the scene.
  update(renderer, scene, camera, delta) {
    // A preceding frame's underwater atmosphere must never leak into the
    // refraction/reflection inputs rendered during this update.
    this.underwaterAtmosphere.beginFrame(scene);
    const clampedDelta = Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    this.time += clampedDelta;

    if (this.bedHeightSampler) {
      this.getWorldPosition(worldPositionScratch);
      const movedX = Math.abs(worldPositionScratch.x - this.shoalingBakedX);
      const phaseUsesDepth = this.nearshorePhaseEnabled && !shouldUseDedicatedBreakerShell(
        this.settings,
        Boolean(this.bedHeightSampler),
      );
      const movedY = phaseUsesDepth
        ? Math.abs(worldPositionScratch.y - this.shoalingBakedY)
        : 0;
      const movedZ = Math.abs(worldPositionScratch.z - this.shoalingBakedZ);
      const phaseChanged = this.nearshorePhaseBakedSignature !== this.nearshorePhaseSignature();
      if (!(movedX <= 0.05 && movedY <= 0.02 && movedZ <= 0.05) || phaseChanged) {
        this.bakeShoalingDepths();
      }
    }
    if (this.dynamics) {
      if (!this.dynamicsPrepared) this.dynamics.update(clampedDelta);
      this.dynamicsPrepared = false;
      this.time = this.dynamics.time;
      this.bindShoreState();
    } else this.updateBreakers();

    if (this.ripples) {
      this.getWorldPosition(worldPositionScratch);
      if (this.followTarget) {
        const target = typeof this.followTarget === 'function'
          ? this.followTarget(followScratch)
          : this.followTarget.getWorldPosition?.(followScratch) ?? this.followTarget;
        if (target && Number.isFinite(target.x)) this.ripples.setCenter(target.x, target.z);
      } else {
        this.ripples.setCenter(worldPositionScratch.x, worldPositionScratch.z);
      }
      this.ripples.update(renderer, clampedDelta);
    }

    this.interactions.update(clampedDelta);
    if (this.splashSystem) {
      // Crowns and foam rings hug the animated surface: rewrite their anchor
      // heights from the same displacement math the mesh uses, so they never
      // hover above a trough or drown under a crest. The wave-scale sampler
      // lets the sheet shader drape ring geometry over the local swell.
      this.getWorldPosition(worldPositionScratch);
      const surfaceX = worldPositionScratch.x;
      const surfaceY = worldPositionScratch.y;
      const surfaceZ = worldPositionScratch.z;
      this.splashSystem.updateSurfaceHeights(
        (localX, localZ) =>
          this.relativeSurfaceHeightAt(localX + surfaceX, localZ + surfaceZ, surfaceY),
        (localX, localZ) =>
          this.waveScaleAt(localX + surfaceX, localZ + surfaceZ, surfaceY),
      );
      this.splashSystem.update(this.time, renderer);
    }

    const uniforms = this.material.uniforms;
    const swashFrame = this.sampleSwashFrame(this.time, this.settings.runupDistance);
    uniforms.uSwashCycle.value = swashFrame.cycle;
    uniforms.uSwashProgress.value = swashFrame.progress;
    uniforms.uSwashIncidenceX.value = swashFrame.primaryDirectionX;
    uniforms.uSwashEdgeShape.value.set(
      swashFrame.edgeShape.phase,
      swashFrame.edgeShape.frequency,
      swashFrame.edgeShape.amplitude,
    );
    uniforms.uSwashRunupScale.value = (this.settings.runupDistance ?? 0) > 0.01
      ? swashFrame.runupScale
      : 1;
    uniforms.uSwashStartOffset.value = (this.settings.runupDistance ?? 0) > 0.01
      ? swashFrame.startOffset
      : 0;
    uniforms.uSwashEndOffset.value = (this.settings.runupDistance ?? 0) > 0.01
      ? swashFrame.endOffset
      : 0;
    uniforms.uTime.value = this.time;
    if (this.shoreState) {
      this.getWorldPosition(worldPositionScratch);
      this.shoreState.update(renderer, {
        time: this.time,
        waterLevel: worldPositionScratch.y,
        waves: this.gerstnerWaves,
        settings: this.settings,
        waveEnergy: this.waveEnergy,
        swashFrame,
      }, clampedDelta);
      this.bindShoreState();
    }
    // Mirror scene.fog so distant water hazes with the rest of the world
    // (the material handles fog manually — see uSceneFog* in the shader;
    // setDistanceFog adds the environment-matching exponential layer).
    if (scene?.fog?.isFog) {
      uniforms.uSceneFogColor.value.copy(scene.fog.color);
      uniforms.uSceneFogDensity.value = 0;
      uniforms.uSceneFogNear.value = scene.fog.near;
      uniforms.uSceneFogFar.value = scene.fog.far;
    } else if (scene?.fog?.isFogExp2) {
      uniforms.uSceneFogColor.value.copy(scene.fog.color);
      uniforms.uSceneFogDensity.value = scene.fog.density;
      uniforms.uSceneFogFar.value = 0;
    } else {
      uniforms.uSceneFogDensity.value = 0;
      uniforms.uSceneFogFar.value = 0;
    }
    updateWaterMaterialCamera(this.material, renderer, camera);
    this.getWorldPosition(worldPositionScratch);
    const cameraPosition = camera.getWorldPosition(followScratch);
    // Use the animated local column, including finite XZ and the authored
    // bed. A flat rest-plane test misclassified cameras inside crests, above
    // troughs, or below dry terrain. Capture passes consume this same flag.
    const cameraSurfaceY = this.getHeightAt(cameraPosition.x, cameraPosition.z);
    const cameraBedY = this.bedHeightSampler?.(cameraPosition.x, cameraPosition.z) ?? -Infinity;
    const cameraBelow = this.containsPoint(cameraPosition.x, cameraPosition.z)
      && cameraPosition.y < cameraSurfaceY && cameraPosition.y > cameraBedY
      && (!this.dynamics || this.dynamics.sample(cameraPosition.x, cameraPosition.z).wet);
    uniforms.uCameraBelow.value = cameraBelow ? 1 : 0;
    const renderedSettings = this.renderedSettings ?? this.settings;
    updateProjectedWaterCaustics({
      enabled: (cameraBelow || Boolean(this.dynamics)) && renderedSettings.causticsStrength > 0.001,
      time: this.time,
      waterLevel: worldPositionScratch.y,
      centerX: worldPositionScratch.x,
      centerZ: worldPositionScratch.z,
      halfWidth: this.width * 0.5,
      halfDepth: this.depth * 0.5,
      color: renderedSettings.sunColor,
      intensity: renderedSettings.causticsStrength * 0.65,
      scale: renderedSettings.causticsScale,
      speed: renderedSettings.causticsSpeed,
      flowDirection: renderedSettings.flowDirection,
      waveDistortion: 0.035 + renderedSettings.detailNormalStrength * 0.08,
      surfaceMap: this.dynamics?.causticTexture ?? null,
      surfaceRegion: this.dynamics?.causticRegion ?? null,
      depthAttenuation: 1 / Math.max(
        renderedSettings.depthFadeDistance + renderedSettings.deepFadeDistance,
        0.25,
      ),
    });
    if (this.ripples) {
      uniforms.uRippleMap.value = this.ripples.texture;
      uniforms.uUseRippleMap.value = 1;
      this.ripples.getRegion(uniforms.uRippleRegion.value);
      uniforms.uRippleTexel.value.copy(this.ripples.texelSize);
    } else {
      uniforms.uUseRippleMap.value = 0;
    }

    if (this.passes) {
      this.passes.render(renderer, scene, camera, this);
      this.passes.bindToMaterial(this.material);
    }
    this.underwaterAtmosphereState = this.underwaterAtmosphere.update(scene, {
      camera,
      cameraX: cameraPosition.x,
      cameraY: cameraPosition.y,
      cameraZ: cameraPosition.z,
      waterX: worldPositionScratch.x,
      waterY: worldPositionScratch.y,
      waterZ: worldPositionScratch.z,
      width: this.width,
      depth: this.depth,
      surfaceY: cameraSurfaceY,
      bedY: cameraBedY,
      settings: renderedSettings,
    });
    return this;
  }

  dispose() {
    this.dynamics?.dispose();
    this.volumeSkirt?.geometry.dispose();
    this.volumeSkirt?.material.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.ripples?.dispose();
    this.shoreState?.dispose();
    if (this.ownsCurrentField) this.currentField?.dispose();
    this.shoreStateMaterials.clear();
    this.splashSystem?.dispose();
    this.breakers?.dispose();
    this.passes?.dispose();
    this.underwaterAtmosphere.dispose();
  }
}
