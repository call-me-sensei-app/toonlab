// Falling-leaf particle layer (the Animation stage). A single InstancedMesh
// of small leaf quads spawned inside the crown volume, colored from the
// canopy palette, using the SAME leaf silhouette as the crown sprite so a
// sakura tree sheds sakura petals. Purely engine-side and live-tunable —
// never part of the plant geometry or GLB export (like wind).

import * as THREE from 'three';
import {
  deriveCanopyPalette, resolveCanopyColor, traceLeafShapePath,
} from '../../../src/vegetation/experimental.js';
import { TREE_SPECIES_PROFILE_BY_ID } from '../../../src/vegetation/treeSpeciesProfiles.js';
import { woodyBaselineInheritedControlsForSpecies } from '../../../src/vegetation/woodyBaselineControls.js';

const MAX_PARTICLES = 240;

export const LEAF_ANIMATION_PRESETS = Object.freeze([
  {
    description: 'Leaves detach and drop gently with a light sway.',
    id: 'falling',
    label: 'Falling Leaves',
    physics: {
      fall: 0.55, spin: 1.2, sway: 0.35, wind: 0.15,
    },
  },
  {
    description: 'Strong breeze carries the leaves sideways as they fall.',
    id: 'drifting',
    label: 'Wind Drift',
    physics: {
      fall: 0.45, spin: 2.2, sway: 0.5, wind: 1.1,
    },
  },
  {
    description: 'Slow tumbling flutter — the sakura-petal look.',
    id: 'fluttering',
    label: 'Petal Flutter',
    physics: {
      fall: 0.28, spin: 3.2, sway: 0.8, wind: 0.35,
    },
  },
]);

function leafTexture(leafShape) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.translate(32, 32);
  ctx.fillStyle = '#fff';
  traceLeafShapePath(
    ctx, leafShape?.preset ?? 'teardrop', 52, 40,
    leafShape?.preset === 'custom' ? leafShape?.outline : null);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

const LEAF_ANIMATION_MAP = new Map(LEAF_ANIMATION_PRESETS.map((preset) => [preset.id, preset]));

export class ToonlabLeafParticleLayer extends THREE.InstancedMesh {
  constructor({
    animation,
    canopyColor,
    groundY = 0.02,
    leafShape,
    plant,
    rng = Math.random,
    seed = 1,
    size = 1,
    space = 'world',
  } = {}) {
    const preset = LEAF_ANIMATION_MAP.get(animation?.preset);
    const physics = animation?.physics ?? preset?.physics ?? null;
    const intensity = animation?.intensity ?? 0.5;
    const count = physics ? Math.max(8, Math.round(MAX_PARTICLES * intensity)) : 0;
    // World-space layers live directly in the scene and need the tree size
    // baked into their quads. Local-space layers are parented to the scaled
    // plant, so baking size would scale leaves twice.
    const particleSize = (space === 'local' ? 1 : size)
      * 0.085
      * Math.max(0.05, Number(animation?.scale) || 1);
    const geometry = new THREE.PlaneGeometry(particleSize, particleSize);
    const material = new THREE.MeshBasicMaterial({
      alphaTest: 0.4,
      map: leafTexture(leafShape),
      side: THREE.DoubleSide,
      transparent: true,
    });
    super(geometry, material, count);
    this.name = 'ToonlabLeafParticles';
    this.frustumCulled = false;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groundY = groundY;
    this.physics = physics;
    this.burstInterval = Math.max(0.05, Number(animation?.burstInterval) || 6);
    this.fade = animation?.fade !== false;
    // The source control expresses lifetime in animation frames.
    this.lifetime = Math.max(0.25, (Number(animation?.lifetime) || 120) / 60);
    this.rng = rng;
    this.space = space;
    this.spawnPoints = [];
    this.particles = [];
    this.time = 0;
    this.hiddenScale = new THREE.Vector3(0.0001, 0.0001, 0.0001);
    this.scaleVector = new THREE.Vector3(1, 1, 1);
    this.matrixScratch = new THREE.Matrix4();
    this.quaternionScratch = new THREE.Quaternion();

    if (!this.physics || !plant) return;
    this.harvestSpawnPoints(plant);
    if (!this.spawnPoints.length) return;

    const palette = deriveCanopyPalette(resolveCanopyColor(canopyColor, seed));
    const color = new THREE.Color();
    this.particles = Array.from({ length: count }, (_, index) => {
      const particle = { delay: 0, position: new THREE.Vector3() };
      this.respawn(particle, true);
      color.copy(palette.lit).lerp(palette.crown, this.rng() * 0.8);
      this.setColorAt(index, color);
      return particle;
    });
    this.instanceColor.needsUpdate = true;
  }

  harvestSpawnPoints(plant) {
    const positionAttr = plant?.canopyMesh?.geometry.getAttribute('position');
    if (!positionAttr) return;
    const point = new THREE.Vector3();
    if (this.space === 'local') {
      plant.canopyMesh.updateMatrix();
      for (let v = 0; v < positionAttr.count; v += 4) {
        point.fromBufferAttribute(positionAttr, v);
        point.applyMatrix4(plant.canopyMesh.matrix);
        this.spawnPoints.push(point.clone());
      }
      return;
    }
    plant.canopyMesh.updateWorldMatrix(true, false);
    for (let v = 0; v < positionAttr.count; v += 4) {
      point.fromBufferAttribute(positionAttr, v);
      plant.canopyMesh.localToWorld(point);
      this.spawnPoints.push(point.clone());
    }
  }

  respawn(particle, initial) {
    if (!this.spawnPoints.length) return;
    const source = this.spawnPoints[Math.floor(this.rng() * this.spawnPoints.length)];
    particle.position.copy(source);
    particle.delay = initial
      ? this.rng() * this.burstInterval
      : this.rng() * this.burstInterval * 0.25;
    particle.age = 0;
    particle.phase = this.rng() * Math.PI * 2;
    particle.spinAxis = new THREE.Vector3(
      this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize();
    particle.speed = 0.7 + this.rng() * 0.6;
  }

  update(delta) {
    if (!this.physics || !this.particles.length) return;
    const dt = Math.min(Math.max(delta ?? 0.016, 0), 0.08);
    this.time += dt;
    this.particles.forEach((particle, index) => {
      if (particle.delay > 0) {
        particle.delay -= dt;
        this.matrixScratch.compose(
          particle.position, this.quaternionScratch.identity(), this.hiddenScale);
        this.setMatrixAt(index, this.matrixScratch);
        return;
      }
      particle.age += dt;
      if (particle.age >= this.lifetime) {
        this.respawn(particle, false);
        return;
      }
      particle.position.y -= this.physics.fall * particle.speed * dt;
      particle.position.x += (this.physics.wind * 0.6
        + Math.sin(this.time * 1.7 + particle.phase) * this.physics.sway * 0.4) * dt;
      particle.position.z += Math.cos(this.time * 1.3 + particle.phase) * this.physics.sway * 0.3 * dt;
      if (particle.position.y <= this.groundY) this.respawn(particle, false);
      this.quaternionScratch.setFromAxisAngle(
        particle.spinAxis, this.time * this.physics.spin * particle.speed + particle.phase);
      const fadeScale = this.fade
        ? THREE.MathUtils.clamp(1 - particle.age / this.lifetime, 0.05, 1)
        : 1;
      this.scaleVector.setScalar(fadeScale);
      this.matrixScratch.compose(particle.position, this.quaternionScratch, this.scaleVector);
      this.setMatrixAt(index, this.matrixScratch);
    });
    this.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

export function createLeafParticles({ engine, store }) {
  const { scene } = engine;
  let mesh = null;
  let lastKey = '';

  function dispose() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.dispose();
    mesh = null;
  }

  function rebuildParticles() {
    dispose();
    const { animation, leafShape, settings } = store.getState();
    const profile = TREE_SPECIES_PROFILE_BY_ID[settings.plant.speciesProfileId];
    const inherited = woodyBaselineInheritedControlsForSpecies(profile);
    const effectiveBaseline = inherited ? {
      ...inherited,
      ...(settings.baselineControls ?? {}),
    } : null;
    const sheddingEnabled = Boolean(effectiveBaseline?.['shedding.enabled']);
    const resolvedAnimation = sheddingEnabled ? {
      burstInterval: Number(effectiveBaseline['shedding.burstInterval']) || 8,
      fade: effectiveBaseline['shedding.fade'] !== false,
      intensity: THREE.MathUtils.clamp(
        (Number(effectiveBaseline['shedding.burstCount']) || 12) / MAX_PARTICLES,
        0.04,
        1,
      ),
      lifetime: Number(effectiveBaseline['shedding.lifetime']) || 120,
      physics: {
        fall: (Number(effectiveBaseline['shedding.fallSpeed']) || 1) * 0.55,
        spin: 1.5,
        sway: 0.3 + (Number(effectiveBaseline['shedding.windInfluence']) || 0) * 0.5,
        wind: Number(effectiveBaseline['shedding.windInfluence']) || 0,
      },
      preset: 'baseline-shedding',
      scale: Number(effectiveBaseline['shedding.scale']) || 1,
    } : animation;
    if (!resolvedAnimation || resolvedAnimation.preset === 'none') return;
    mesh = new ToonlabLeafParticleLayer({
      animation: resolvedAnimation,
      canopyColor:
        Array.isArray(settings.color.canopy) ? [...settings.color.canopy] : settings.color.canopy,
      leafShape,
      plant: engine.getPlant(),
      seed: settings.plant.seed,
      size: settings.plant.size,
      space: 'world',
    });
    if (mesh.particles.length) scene.add(mesh);
    else dispose();
  }

  // Watch the store: animation/leafShape/palette changes rebuild the layer;
  // plant rebuilds re-anchor it (crown volume moves).
  let lastAnimation = store.getState().animation;
  store.subscribe(() => {
    const { animation, leafShape, settings } = store.getState();
    const key = JSON.stringify([
      animation,
      leafShape,
      settings.color.canopy,
      settings.plant.size,
      settings.plant.speciesProfileId,
      settings.baselineControls,
    ]);
    if (animation !== lastAnimation || key !== lastKey) {
      lastAnimation = animation;
      lastKey = key;
      rebuildParticles();
    }
  });
  engine.onRebuilt(() => rebuildParticles());
  engine.onFrame((delta) => mesh?.update(delta));

  return { rebuildParticles };
}
