import * as THREE from 'three';

import {
  StylizedTree,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  serializableTreeOptions,
} from './stylizedTree.js';
import { FLOWER_SPECIES, createFlowerHeadGeometry } from './flowerSpecies.js';
import {
  createFlowerBloomNodeMaterial,
  createFlowerStemNodeMaterial,
} from '../shaders-tsl/flower.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

// Horizontal heading of the lab's default sun ([0.35, 0.75, 0.5]): blooms
// bake their facing toward it at build time (heliotropism), fixed in world
// space.
const SUN_HEADING = new THREE.Vector3(0.45, 0, 0.65).normalize();
const UP = new THREE.Vector3(0, 1, 0);

// Deterministic head-orientation rng (mulberry32-alike, tiny) — same recipe,
// same blooms.
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A flowering plant as a first-class plant type: the full StylizedTree
// machinery — its own stem (trunk), branch skeleton, and leaf-card tufts —
// re-proportioned to read as a flower, with bloom heads from the
// FLOWER_SPECIES catalog at every branch tip. Same polymorphic runtime API
// as StylizedTree/StylizedBush (setSun/setWind/update/toJSON/dispose), so
// scenes and the tree designer treat all plant types alike:
//
//   const flower = new StylizedFlower({ species: 'sunflower', seed: 4 });
//   scene.add(flower);
//   flower.update(delta);
//
//   species        — FLOWER_SPECIES id ('daisy', 'poppy', 'rose', ...)
//   headColor      — petal color override (sRGB triplet); null = species default
//   headScale      — bloom size relative to the leaf tufts
//   stemColor      — toon stem/branch color
//   ...rest        — any StylizedTree option (trunk, skeleton, canopy, ...)
export class StylizedFlower extends StylizedTree {
  constructor(options = {}) {
    const source = options && typeof options === 'object' ? options : {};
    const {
      species = 'daisy',
      headColor = null,
      headScale = 1,
      stemColor = 0x4d8a3f,
      ...treeOptions
    } = source;

    // Flowering-plant proportions layered over the incoming tree options:
    // whatever trunk/skeleton settings arrive, the stem stays thin and green
    // and the leaf tufts stay small, so switching a tree recipe's type to
    // 'flower' always reads as a flower rather than a green tree.
    const trunk = { ...treeOptions.trunk };
    // Stem height is capped in WORLD meters (branches and blooms extend
    // past the stem, so a 1.2m stem tops out around head height): tree
    // recipes switched to 'flower' stay human-scale instead of inheriting
    // a tree-sized trunk.
    const plantSize = treeOptions.size ?? 1;
    trunk.height = Math.min(trunk.height ?? 1.2, 1.2 / Math.max(plantSize, 0.1));
    trunk.radiusBottom = Math.min(trunk.radiusBottom ?? 0.045, 0.07);
    super({
      canopyColor: 0x4d8a3f,
      leafDensity: 0.7,
      ...treeOptions,
      trunk,
      canopyScale: Math.min(treeOptions.canopyScale ?? 0.45, 0.7),
      canopy: {
        cardSizeRange: [0.32, 0.5],
        cardsPerCluster: 4,
        clusterRadius: 0.2,
        ...treeOptions.canopy,
      },
      skeleton: {
        radialSegments: 6,
        tipRadius: 0.012,
        minLimbRadius: 0.01,
        ...treeOptions.skeleton,
      },
      trunkMaterial: createFlowerStemNodeMaterial({
        color: stemColor,
        height: trunk.height,
        vegetationShader: treeOptions.vegetationShader,
      }),
    });
    this.name = 'StylizedFlower';
    // super() stored the re-proportioned options; toJSON must round-trip the
    // ORIGINAL flower options so the recipe rebuilds this exact plant.
    this.config = source;

    // Blooms grow from branch tips. foliageAttachments are canopyMesh-local
    // and index-aligned with the leaf tufts, so blooms sit where the twigs
    // end and inherit the canopy anchor/scale by parenting. Heads are
    // camera-facing billboard instances (iOrigin/iInfo), so a bloom never
    // renders as an edge-on streak.
    const spec = FLOWER_SPECIES.find((entry) => entry.id === species)
      ?? FLOWER_SPECIES.find((entry) => entry.id === 'daisy');
    const attachments = this.foliageAttachments;
    const size = this.settings.tree.size;
    const canopyScale = this.canopyMesh.scale.x || 1;
    // Real-world bloom size: species headDiameter is in METERS, converted to
    // canopy-local units, so a daisy stays palm-sized and a sunflower
    // plate-sized no matter how the plant is scaled or the crown laid out.
    const headSize = (spec.headDiameter ?? 0.08) * headScale
      / Math.max(size * canopyScale, 1e-3);

    const random = rng((this.settings.tree.seed * 131 + 17) >>> 0);
    const direction = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const placed = [];
    attachments.forEach((attachment) => {
      const jitter = 0.8 + random() * 0.4;
      const phase = random();
      // Clear of the leaf tuft along the twig so leaf cards don't slice
      // through the petals: half a head plus a tuft-sized clearance
      // (clusterRadius + card reach, in canopy-local units).
      direction.copy(attachment.direction ?? zAxis).normalize();
      const center = attachment.position.clone()
        .addScaledVector(direction, headSize * jitter * 0.5 + 0.3);
      const radius = (headSize * jitter) / 2;
      // Bloom-vs-bloom collision: skip heads that would overlap an already
      // placed one, so crowded twig clusters read as distinct flowers.
      const collides = placed.some((other) =>
        other.center.distanceTo(center) < (other.radius + radius) * 0.85);
      if (collides) return;
      // World-fixed facing (never follows the camera): heliotropism — every
      // bloom leans toward the scene's sun heading (the lab's default sun
      // azimuth), lifted by the species' faceUp bias and varied a little by
      // its own twig. Sunflowers all face the sun near-horizontally; tulip
      // cups open skyward.
      const tilt = SUN_HEADING.clone()
        .addScaledVector(direction, 0.35)
        .add(UP.clone().multiplyScalar(spec.faceUp ?? 0.8))
        .normalize();
      placed.push({ center, phase, radius, size: headSize * jitter, tilt });
    });

    // Leaf/bloom collision: collapse any leaf card whose billboard extent
    // would slice through a bloom. Cards expand aInfo.x around their center
    // in the vertex shader, so zeroing aInfo.x on all four corners removes
    // the card without touching the index buffer.
    if (placed.length) {
      const cardCenters = this.canopyMesh.geometry.getAttribute('position');
      const cardInfo = this.canopyMesh.geometry.getAttribute('aInfo');
      const cardCenter = new THREE.Vector3();
      for (let vertex = 0; vertex < cardCenters.count; vertex += 4) {
        cardCenter.fromBufferAttribute(cardCenters, vertex);
        const reach = cardInfo.getX(vertex) * 0.45;
        const hit = placed.some((head) =>
          cardCenter.distanceTo(head.center) < head.radius + reach);
        if (hit) {
          for (let corner = 0; corner < 4; corner += 1) cardInfo.setX(vertex + corner, 0);
        }
      }
      cardInfo.needsUpdate = true;
    }

    // Real 3D bloom meshes (EZ-Tree-style flower models, built procedurally):
    // curved petals + center dome, vertex-colored, world-anchored — each
    // bloom faces up-and-out along its twig like a real flower head instead
    // of tracking the camera.
    const headMaterial = createFlowerBloomNodeMaterial({
      vegetationShader: treeOptions.vegetationShader,
      windSpeed: 1.1,
      windStrength: headSize * 0.04,
    });
    const heads = new THREE.InstancedMesh(
      createFlowerHeadGeometry({ color: headColor, species: spec.id }),
      headMaterial, placed.length);
    heads.name = 'StylizedFlowerHeads';
    heads.frustumCulled = false;
    heads.userData.environmentShaderExclude = true;

    const matrix = new THREE.Matrix4();
    const facing = new THREE.Quaternion();
    const roll = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placed.forEach((head, index) => {
      direction.copy(head.tilt);
      facing.setFromUnitVectors(zAxis, direction);
      roll.setFromAxisAngle(direction, head.phase * Math.PI * 2);
      scale.setScalar(head.size);
      matrix.compose(head.center, roll.multiply(facing), scale);
      heads.setMatrixAt(index, matrix);
    });

    this.headsMesh = heads;
    this.canopyMesh.add(heads);
    markFactoryStyleMaterial(this.trunkMesh.material, 'FlowerStem');
    markFactoryStyleMaterial(this.canopyMesh.material, 'FlowerFoliage');
    markFactoryStyleMaterial(this.headsMesh.material, 'FlowerBloom');
    const styleTarget = treeOptions.styleTarget ?? {};
    attachFactoryStyleTarget(this, 'vegetation.flower', {
      targetId: 'toonlab/flower',
      ...styleTarget,
      materials: {
        assignments: {
          FlowerBloom: {
            exemptionId: 'toonlab-flower-bloom',
            roles: ['flowerPetal', 'flowerCenter'],
          },
          FlowerFoliage: { roles: ['foliageCard'] },
          FlowerStem: { roles: ['herbaceousStem'] },
        },
        exemptions: {
          'toonlab-flower-bloom': {
            adapterId: 'toonlab:flower-bloom',
            approved: true,
            reason: 'The package flower renderer separates petal and center response inside one managed material.',
            strategy: 'custom-adapter',
          },
        },
        ...(styleTarget.materials ?? {}),
      },
    });
  }

  toJSON() {
    return {
      schema: TREE_RECIPE_SCHEMA,
      version: TREE_RECIPE_VERSION,
      type: 'flower',
      options: serializableTreeOptions(this.config),
    };
  }

  setWind(options = {}) {
    super.setWind(options);
    for (const material of [this.headsMesh?.material, this.trunkMesh?.material]) {
      const uniforms = material?.uniforms;
      if (!uniforms) continue;
      if (options.speed !== undefined && uniforms.uWindSpeed) uniforms.uWindSpeed.value = Number(options.speed) || 0;
      if (options.strength !== undefined && uniforms.uWindStrength) uniforms.uWindStrength.value = Math.max(Number(options.strength) || 0, 0);
      if (options.direction !== undefined && uniforms.uWindDirection) {
        const direction = Array.isArray(options.direction)
          ? options.direction
          : [options.direction.x, options.direction.y ?? options.direction.z];
        uniforms.uWindDirection.value.set(Number(direction[0]) || 0, Number(direction[1]) || 0);
      }
    }
    return this;
  }

  setSun(options = {}) {
    super.setSun(options);
    const uniforms = this.headsMesh?.material?.uniforms;
    if (!uniforms) return this;
    if (options.direction !== undefined && uniforms.uSunDirection) {
      const direction = Array.isArray(options.direction)
        ? options.direction
        : [options.direction.x, options.direction.y, options.direction.z];
      uniforms.uSunDirection.value.set(...direction).normalize();
    }
    if (options.color !== undefined && uniforms.uSunColor) {
      const color = Array.isArray(options.color)
        ? options.color
        : [options.color.r, options.color.g, options.color.b];
      uniforms.uSunColor.value.setRGB(...color, THREE.SRGBColorSpace);
    }
    if (options.sky !== undefined && uniforms.uSkyColor) {
      const sky = Array.isArray(options.sky)
        ? options.sky
        : [options.sky.r, options.sky.g, options.sky.b];
      uniforms.uSkyColor.value.setRGB(...sky, THREE.SRGBColorSpace);
    }
    if (Number.isFinite(options.intensity) && uniforms.uSunIntensity) {
      uniforms.uSunIntensity.value = Math.max(options.intensity, 0);
    }
    if (Number.isFinite(options.skyIntensity) && uniforms.uSkyIntensity) {
      uniforms.uSkyIntensity.value = Math.max(options.skyIntensity, 0);
    }
    return this;
  }

  setCloudShadow(options = {}) {
    super.setCloudShadow(options);
    for (const material of [this.headsMesh?.material, this.trunkMesh?.material]) {
      const uniforms = material?.uniforms;
      if (!uniforms) continue;
      if (options.strength !== undefined && uniforms.uCloudShadowStrength) {
        uniforms.uCloudShadowStrength.value = THREE.MathUtils.clamp(Number(options.strength) || 0, 0, 1);
      }
      if (options.coverage !== undefined && uniforms.uCloudShadowCoverage) {
        uniforms.uCloudShadowCoverage.value = THREE.MathUtils.clamp(Number(options.coverage) || 0, 0, 1);
      }
      if (options.scale !== undefined && uniforms.uCloudShadowScale) {
        uniforms.uCloudShadowScale.value = Math.max(Number(options.scale) || 0.0001, 0.0001);
      }
      if (options.velocity !== undefined && uniforms.uCloudShadowVelocity) {
        const velocity = Array.isArray(options.velocity)
          ? options.velocity
          : [options.velocity.x, options.velocity.y];
        uniforms.uCloudShadowVelocity.value.set(Number(velocity[0]) || 0, Number(velocity[1]) || 0);
      }
    }
    return this;
  }

  setSurfaceWeather(options = {}) {
    super.setSurfaceWeather?.(options);
    for (const material of [this.headsMesh?.material, this.trunkMesh?.material]) {
      const uniforms = material?.uniforms;
      if (uniforms?.uWetness && options.wetness !== undefined) {
        uniforms.uWetness.value = THREE.MathUtils.clamp(Number(options.wetness) || 0, 0, 1);
      }
      if (uniforms?.uSnowCover && options.snowCover !== undefined) {
        uniforms.uSnowCover.value = THREE.MathUtils.clamp(Number(options.snowCover) || 0, 0, 1);
      }
    }
    return this;
  }

  dispose() {
    this.headsMesh.geometry.dispose();
    this.headsMesh.material.dispose();
    super.dispose();
  }
}
