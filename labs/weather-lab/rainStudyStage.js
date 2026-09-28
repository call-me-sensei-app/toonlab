import * as THREE from 'three';

const FLOOR_SIZE = 46;
const FLOOR_TOP = 0.48;
const IMPACT_CAPACITY = 96;
const SPRAY_PER_IMPACT = 4;
const RAIN_IMPACT_TYPES = new Set(['rain', 'sleet', 'hail']);

const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothToward(current, target, speed, delta) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));
}

function createReflectionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 78, 3, 64, 126, 122);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.52, 'rgba(255,255,255,0.13)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRectSurface({ x, z, halfX, halfZ, rotation = 0, top }) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    heightAt(sampleX, sampleZ) {
      const dx = sampleX - x;
      const dz = sampleZ - z;
      const localX = dx * cosine + dz * sine;
      const localZ = -dx * sine + dz * cosine;
      return Math.abs(localX) <= halfX && Math.abs(localZ) <= halfZ ? top : null;
    },
    sample(random) {
      const localX = (random() * 2 - 1) * halfX * 0.9;
      const localZ = (random() * 2 - 1) * halfZ * 0.9;
      return {
        x: x + localX * cosine - localZ * sine,
        y: top,
        z: z + localX * sine + localZ * cosine,
      };
    },
  };
}

function createCircleSurface({ x, z, radius, top }) {
  return {
    heightAt(sampleX, sampleZ) {
      return Math.hypot(sampleX - x, sampleZ - z) <= radius ? top : null;
    },
    sample(random) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius * 0.88;
      return { x: x + Math.cos(angle) * distance, y: top, z: z + Math.sin(angle) * distance };
    },
  };
}

function createSphereSurface({ x, y, z, radius }) {
  return {
    heightAt(sampleX, sampleZ) {
      const dx = sampleX - x;
      const dz = sampleZ - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > radius * radius * 0.74) return null;
      return y + Math.sqrt(Math.max(radius * radius - distanceSq, 0));
    },
    sample(random) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius * 0.78;
      const sampleX = x + Math.cos(angle) * distance;
      const sampleZ = z + Math.sin(angle) * distance;
      return { x: sampleX, y: this.heightAt(sampleX, sampleZ), z: sampleZ };
    },
  };
}

class RainImpactField {
  constructor({ parent, surfaces, lightPools, seed }) {
    this.random = seededRandom(seed);
    this.surfaces = surfaces;
    this.lightPools = lightPools;
    this.spawnAccumulator = 0;
    this.cursor = 0;
    this.activeCount = 0;

    const ringGeometry = new THREE.RingGeometry(0.72, 1, 28);
    ringGeometry.rotateX(-Math.PI * 0.5);
    const ringMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      depthWrite: false,
      opacity: 0.76,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
      vertexColors: true,
    });
    this.rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, IMPACT_CAPACITY);
    this.rings.name = 'Rain impact rings';
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 58;
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.rings);

    this.impacts = Array.from({ length: IMPACT_CAPACITY }, (_, index) => {
      scratchMatrix.makeScale(0, 0, 0);
      this.rings.setMatrixAt(index, scratchMatrix);
      this.rings.setColorAt(index, new THREE.Color(0));
      return {
        active: false,
        age: 0,
        color: new THREE.Color(0xb8e7ff),
        lifetime: 0.55,
        position: new THREE.Vector3(),
      };
    });

    const sprayCount = IMPACT_CAPACITY * SPRAY_PER_IMPACT;
    const positions = new Float32Array(sprayCount * 3);
    const colors = new Float32Array(sprayCount * 3);
    positions.fill(-1000);
    const sprayGeometry = new THREE.BufferGeometry();
    sprayGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sprayGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sprayMaterial = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      depthWrite: false,
      opacity: 0.72,
      size: 0.085,
      sizeAttenuation: true,
      toneMapped: false,
      transparent: true,
      vertexColors: true,
    });
    this.spray = new THREE.Points(sprayGeometry, sprayMaterial);
    this.spray.name = 'Rain impact spray';
    this.spray.frustumCulled = false;
    this.spray.renderOrder = 59;
    parent.add(this.spray);
    this.sprayParticles = Array.from({ length: sprayCount }, () => ({
      active: false,
      age: 0,
      color: new THREE.Color(),
      lifetime: 0.36,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }));
  }

  _floorHeightAt(x, z) {
    let height = FLOOR_TOP;
    for (const surface of this.surfaces) {
      const candidate = surface.heightAt(x, z);
      if (candidate !== null) height = Math.max(height, candidate);
    }
    return height;
  }

  _sampleImpactPosition() {
    if (this.random() < 0.38 && this.surfaces.length > 0) {
      const surface = this.surfaces[Math.floor(this.random() * this.surfaces.length)];
      return surface.sample(this.random);
    }
    const limit = FLOOR_SIZE * 0.47;
    const x = (this.random() * 2 - 1) * limit;
    const z = (this.random() * 2 - 1) * limit;
    return { x, y: this._floorHeightAt(x, z), z };
  }

  _impactColorAt(position, output) {
    output.set(0xaedfff);
    let strongest = 0;
    let closest = null;
    for (const pool of this.lightPools) {
      const distance = Math.hypot(position.x - pool.x, position.z - pool.z);
      const influence = Math.max(1 - distance / pool.radius, 0);
      if (influence > strongest) {
        strongest = influence;
        closest = pool;
      }
    }
    if (closest) output.lerp(closest.color, strongest * 0.72).multiplyScalar(1 + strongest * 0.5);
    return output;
  }

  _spawn() {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % IMPACT_CAPACITY;
    const impact = this.impacts[index];
    const position = this._sampleImpactPosition();
    impact.active = true;
    impact.age = 0;
    impact.lifetime = 0.42 + this.random() * 0.28;
    impact.position.set(position.x, position.y + 0.025, position.z);
    this._impactColorAt(position, impact.color);

    for (let sprayIndex = 0; sprayIndex < SPRAY_PER_IMPACT; sprayIndex += 1) {
      const particle = this.sprayParticles[index * SPRAY_PER_IMPACT + sprayIndex];
      const angle = this.random() * Math.PI * 2;
      const speed = 0.34 + this.random() * 0.78;
      particle.active = true;
      particle.age = 0;
      particle.lifetime = 0.22 + this.random() * 0.22;
      particle.position.copy(impact.position);
      particle.velocity.set(Math.cos(angle) * speed, 0.7 + this.random() * 1.15, Math.sin(angle) * speed);
      particle.color.copy(impact.color);
    }
  }

  update(delta, weather) {
    const precipitation = weather?.precipitation ?? {};
    const surface = weather?.surface ?? {};
    const intensity = THREE.MathUtils.clamp(Number(precipitation.intensity) || 0, 0, 1);
    const wetness = THREE.MathUtils.clamp(Number(surface.wetness) || 0, 0, 1);
    const impactStrength = RAIN_IMPACT_TYPES.has(precipitation.type) ? intensity : 0;
    const typeScale = precipitation.type === 'hail' ? 0.58 : precipitation.type === 'sleet' ? 0.72 : 1;
    this.spawnAccumulator += impactStrength * typeScale * (10 + wetness * 48) * delta;
    let spawnCount = Math.min(Math.floor(this.spawnAccumulator), 6);
    this.spawnAccumulator -= spawnCount;
    while (spawnCount > 0) {
      this._spawn();
      spawnCount -= 1;
    }

    this.activeCount = 0;
    for (let index = 0; index < this.impacts.length; index += 1) {
      const impact = this.impacts[index];
      if (!impact.active) continue;
      impact.age += delta;
      const progress = impact.age / impact.lifetime;
      if (progress >= 1) {
        impact.active = false;
        scratchMatrix.makeScale(0, 0, 0);
        this.rings.setMatrixAt(index, scratchMatrix);
        this.rings.setColorAt(index, scratchColor.set(0));
        continue;
      }
      this.activeCount += 1;
      const eased = 1 - (1 - progress) * (1 - progress);
      const radius = 0.055 + eased * (0.46 + impactStrength * 0.28);
      const fade = Math.pow(1 - progress, 1.65) * (0.45 + impactStrength * 0.55);
      scratchPosition.copy(impact.position);
      scratchScale.set(radius, radius, radius);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      this.rings.setMatrixAt(index, scratchMatrix);
      this.rings.setColorAt(index, scratchColor.copy(impact.color).multiplyScalar(fade));
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.rings.material.opacity = 0.35 + wetness * 0.48;

    const positions = this.spray.geometry.attributes.position;
    const colors = this.spray.geometry.attributes.color;
    for (let index = 0; index < this.sprayParticles.length; index += 1) {
      const particle = this.sprayParticles[index];
      const offset = index * 3;
      if (!particle.active) continue;
      particle.age += delta;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        positions.array[offset + 1] = -1000;
        colors.array[offset] = 0;
        colors.array[offset + 1] = 0;
        colors.array[offset + 2] = 0;
        continue;
      }
      const time = particle.age;
      const fade = Math.pow(1 - time / particle.lifetime, 1.8);
      positions.array[offset] = particle.position.x + particle.velocity.x * time;
      positions.array[offset + 1] = particle.position.y + particle.velocity.y * time - 4.9 * time * time;
      positions.array[offset + 2] = particle.position.z + particle.velocity.z * time;
      colors.array[offset] = particle.color.r * fade;
      colors.array[offset + 1] = particle.color.g * fade;
      colors.array[offset + 2] = particle.color.b * fade;
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.spray.material.opacity = impactStrength * (0.32 + wetness * 0.52);
  }
}

function createRainLens(mount, seed) {
  const canvas = document.createElement('canvas');
  canvas.className = 'wl-rain-lens';
  canvas.setAttribute('aria-hidden', 'true');
  mount.appendChild(canvas);
  const context = canvas.getContext('2d');
  const random = seededRandom(seed);
  const drops = Array.from({ length: 30 }, () => ({
    drift: (random() * 2 - 1) * 0.018,
    radius: 2 + random() * 7,
    speed: 0.025 + random() * 0.12,
    x: random(),
    y: random(),
  }));
  let strength = 0;
  let width = 0;
  let height = 0;

  function resize() {
    const nextWidth = mount.clientWidth || window.innerWidth;
    const nextHeight = mount.clientHeight || window.innerHeight;
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  return {
    dispose() {
      canvas.remove();
    },
    update(delta, precipitation, wetness) {
      resize();
      const rain = precipitation?.type === 'rain' || precipitation?.type === 'sleet';
      const target = rain
        ? THREE.MathUtils.clamp((Number(precipitation.intensity) || 0) * (0.35 + wetness * 0.65), 0, 1)
        : 0;
      strength = smoothToward(strength, target, target > strength ? 3.4 : 1.7, delta);
      canvas.style.opacity = String(Math.min(strength * 0.72, 0.5));
      context.clearRect(0, 0, width, height);
      if (strength < 0.008) return;

      context.save();
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      for (const drop of drops) {
        drop.y += drop.speed * delta * (0.3 + strength * 2.2);
        drop.x += drop.drift * delta * strength;
        if (drop.y > 1.08 || drop.x < -0.06 || drop.x > 1.06) {
          drop.y = -0.08 - random() * 0.2;
          drop.x = random();
        }
        const x = drop.x * width;
        const y = drop.y * height;
        const radius = drop.radius * (0.65 + strength * 0.65);
        const alpha = 0.08 + strength * 0.18;
        context.shadowBlur = radius * 1.6;
        context.shadowColor = 'rgba(165,220,255,' + alpha * 0.55 + ')';
        context.strokeStyle = 'rgba(205,238,255,' + alpha + ')';
        context.lineWidth = Math.max(radius * 0.22, 0.7);
        context.beginPath();
        context.moveTo(x, y - radius * 0.9);
        context.lineTo(x - drop.drift * width * 0.4, y - radius * (3 + strength * 5));
        context.stroke();
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = 'rgba(230,248,255,' + alpha * 0.65 + ')';
        context.beginPath();
        context.arc(x - radius * 0.25, y - radius * 0.28, Math.max(radius * 0.16, 0.7), 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    },
  };
}

function addReactiveMaterial(entries, options) {
  const material = new THREE.MeshPhysicalMaterial({
    clearcoat: 1,
    clearcoatRoughness: options.dryClearcoatRoughness ?? 0.62,
    color: options.dryColor,
    metalness: options.metalness ?? 0,
    roughness: options.dryRoughness,
  });
  entries.push({
    dryClearcoatRoughness: options.dryClearcoatRoughness ?? 0.62,
    dryColor: new THREE.Color(options.dryColor),
    dryRoughness: options.dryRoughness,
    material,
    wetClearcoatRoughness: options.wetClearcoatRoughness ?? 0.045,
    wetColor: new THREE.Color(options.wetColor),
    wetRoughness: options.wetRoughness,
  });
  return material;
}

function addLamp(root, reflectionTexture, config) {
  const color = new THREE.Color(config.color);
  const point = new THREE.PointLight(color, config.intensity, config.distance ?? 28, 2);
  point.position.set(config.x, config.y, config.z);
  root.add(point);

  const bulbMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const bulb = config.central
    ? new THREE.Mesh(new THREE.SphereGeometry(1.55, 28, 18), bulbMaterial)
    : new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.45, 2.7), bulbMaterial);
  bulb.position.copy(point.position);
  bulb.name = config.central ? 'White rain key light' : 'Colored rain light';
  root.add(bulb);

  if (!config.central) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(3.25, 0.35, 3.25),
      new THREE.MeshStandardMaterial({ color: 0x171b22, metalness: 0.75, roughness: 0.36 }),
    );
    housing.position.copy(point.position).add(new THREE.Vector3(0, -0.35, 0));
    root.add(housing);
  }

  const beamHeight = config.y - FLOOR_TOP;
  const beamMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color,
    depthWrite: false,
    opacity: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(config.central ? 5.2 : 3.7, beamHeight, 26, 1, true),
    beamMaterial,
  );
  beam.position.set(config.x, FLOOR_TOP + beamHeight * 0.5, config.z);
  beam.renderOrder = 4;
  root.add(beam);

  const reflectionMaterial = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color,
    depthWrite: false,
    map: reflectionTexture,
    opacity: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reflectionMaterial);
  reflection.position.set(config.x, FLOOR_TOP + 0.035, config.z + (config.reflectionOffset ?? 0));
  reflection.rotation.x = -Math.PI * 0.5;
  reflection.rotation.z = config.rotation ?? 0;
  reflection.scale.set(config.reflectionWidth ?? 7, config.reflectionLength ?? 13, 1);
  reflection.renderOrder = 3;
  root.add(reflection);

  return {
    baseIntensity: config.intensity,
    beamMaterial,
    color,
    point,
    reflectionMaterial,
    reflectionStrength: config.reflectionStrength ?? 1,
    x: config.x,
    z: config.z,
  };
}

/**
 * A compact rain-reaction stage: dry/wet PBR materials, practical lights,
 * glossy tile reflections, surface-aware impacts, and a restrained lens layer.
 * It intentionally sits inside the normal Weather Lab world so every shared
 * condition still drives the scene through WeatherSystem.
 */
export function createRainStudyStage({ mount, scene, center, seed = 73 }) {
  const root = new THREE.Group();
  root.name = 'Weather Lab rain reaction stage';
  root.position.copy(center);
  scene.add(root);

  const reactiveMaterials = [];
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    clearcoat: 1,
    clearcoatRoughness: 0.64,
    color: 0x59616b,
    metalness: 0.16,
    roughness: 0.86,
    vertexColors: true,
  });
  const tileColumns = 11;
  const tileSize = FLOOR_SIZE / tileColumns;
  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(tileSize - 0.11, 0.22, tileSize - 0.11),
    floorMaterial,
    tileColumns * tileColumns,
  );
  tiles.name = 'Wetness test tiles';
  const tileRandom = seededRandom(seed + 11);
  let tileIndex = 0;
  for (let row = 0; row < tileColumns; row += 1) {
    for (let column = 0; column < tileColumns; column += 1) {
      const x = (column - (tileColumns - 1) * 0.5) * tileSize;
      const z = (row - (tileColumns - 1) * 0.5) * tileSize;
      scratchPosition.set(x, FLOOR_TOP - 0.11 + (tileRandom() - 0.5) * 0.018, z);
      scratchQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (tileRandom() - 0.5) * 0.012);
      scratchScale.set(1, 1, 1);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      tiles.setMatrixAt(tileIndex, scratchMatrix);
      const shade = 0.82 + tileRandom() * 0.18;
      tiles.setColorAt(tileIndex, new THREE.Color(shade, shade * 0.99, shade * 0.97));
      tileIndex += 1;
    }
  }
  root.add(tiles);

  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_SIZE + 1.2, 1.2, FLOOR_SIZE + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x171c24, metalness: 0.08, roughness: 0.82 }),
  );
  foundation.position.y = -0.23;
  root.add(foundation);

  const edgeMaterial = addReactiveMaterial(reactiveMaterials, {
    dryColor: 0x6e747b,
    dryRoughness: 0.48,
    metalness: 0.82,
    wetColor: 0x252a30,
    wetRoughness: 0.08,
  });
  for (const [x, z, width, depth] of [
    [0, -FLOOR_SIZE * 0.5, FLOOR_SIZE + 0.6, 0.38],
    [0, FLOOR_SIZE * 0.5, FLOOR_SIZE + 0.6, 0.38],
    [-FLOOR_SIZE * 0.5, 0, 0.38, FLOOR_SIZE + 0.6],
    [FLOOR_SIZE * 0.5, 0, 0.38, FLOOR_SIZE + 0.6],
  ]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.46, depth), edgeMaterial);
    edge.position.set(x, FLOOR_TOP - 0.04, z);
    root.add(edge);
  }

  const surfaces = [];
  const stoneMaterial = addReactiveMaterial(reactiveMaterials, {
    dryColor: 0x7e858c,
    dryRoughness: 0.94,
    wetColor: 0x303a42,
    wetRoughness: 0.16,
  });
  const sphereRadius = 3.25;
  const sphereCenter = new THREE.Vector3(-3.5, FLOOR_TOP + sphereRadius, 2.2);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 48, 28), stoneMaterial);
  sphere.position.copy(sphereCenter);
  sphere.name = 'Wet stone sphere';
  root.add(sphere);
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x20262d, metalness: 0.36, roughness: 0.22 });
  const equator = new THREE.Mesh(new THREE.TorusGeometry(sphereRadius * 1.006, 0.055, 8, 72), bandMaterial);
  equator.position.copy(sphereCenter);
  equator.rotation.x = Math.PI * 0.5;
  root.add(equator);
  surfaces.push(createSphereSurface({ x: sphereCenter.x, y: sphereCenter.y, z: sphereCenter.z, radius: sphereRadius }));

  const paintMaterial = addReactiveMaterial(reactiveMaterials, {
    dryColor: 0xc89f65,
    dryRoughness: 0.68,
    wetColor: 0x604025,
    wetRoughness: 0.1,
  });
  const boxRotation = -0.18;
  const box = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.1, 5.2), paintMaterial);
  box.position.set(8.5, FLOOR_TOP + 2.05, -7.4);
  box.rotation.y = boxRotation;
  box.name = 'Wet painted block';
  root.add(box);
  surfaces.push(createRectSurface({
    halfX: 2.9,
    halfZ: 2.6,
    rotation: boxRotation,
    top: FLOOR_TOP + 4.1,
    x: box.position.x,
    z: box.position.z,
  }));

  const metalMaterial = addReactiveMaterial(reactiveMaterials, {
    dryColor: 0xa7b5c1,
    dryRoughness: 0.42,
    metalness: 0.92,
    wetColor: 0x4b5d6b,
    wetRoughness: 0.045,
  });
  const cylinderRadius = 2.05;
  const cylinderHeight = 4.7;
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 40), metalMaterial);
  cylinder.position.set(10.5, FLOOR_TOP + cylinderHeight * 0.5, 6.5);
  cylinder.name = 'Wet metal cylinder';
  root.add(cylinder);
  surfaces.push(createCircleSurface({
    radius: cylinderRadius,
    top: FLOOR_TOP + cylinderHeight,
    x: cylinder.position.x,
    z: cylinder.position.z,
  }));

  const benchMaterial = addReactiveMaterial(reactiveMaterials, {
    dryColor: 0x915a3e,
    dryRoughness: 0.76,
    wetColor: 0x3f2118,
    wetRoughness: 0.12,
  });
  const bench = new THREE.Group();
  bench.position.set(-10.5, 0, -7.2);
  bench.rotation.y = 0.24;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.5, 2.25), benchMaterial);
  seat.position.y = FLOOR_TOP + 1.65;
  bench.add(seat);
  for (const legX of [-2.55, 2.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.7, 1.5), metalMaterial);
    leg.position.set(legX, FLOOR_TOP + 0.8, 0);
    bench.add(leg);
  }
  bench.name = 'Wet bench';
  root.add(bench);
  surfaces.push(createRectSurface({
    halfX: 3.6,
    halfZ: 1.13,
    rotation: bench.rotation.y,
    top: FLOOR_TOP + 1.9,
    x: bench.position.x,
    z: bench.position.z,
  }));

  const puddleMaterial = new THREE.MeshBasicMaterial({
    color: 0x9bdcff,
    depthWrite: false,
    opacity: 0,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const puddles = [
    [-13, 9, 3.8, 2.2, 0.22],
    [3.5, -13, 4.6, 2.4, -0.35],
    [13.5, -0.5, 3.1, 1.7, 0.5],
    [-1, 13, 5, 2.2, -0.08],
  ].map(([x, z, width, depth, rotation]) => {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 56), puddleMaterial.clone());
    puddle.position.set(x, FLOOR_TOP + 0.026, z);
    puddle.rotation.x = -Math.PI * 0.5;
    puddle.rotation.z = rotation;
    puddle.scale.set(width, depth, 1);
    puddle.renderOrder = 2;
    root.add(puddle);
    return puddle;
  });

  const reflectionTexture = createReflectionTexture();
  const lampConfigs = [
    { central: true, color: 0xf2fbff, distance: 34, intensity: 330, reflectionLength: 18, reflectionStrength: 1.25, reflectionWidth: 11, x: 0, y: 11.5, z: 0 },
    { color: 0x68e8ff, intensity: 210, reflectionLength: 13, reflectionWidth: 7, rotation: 0.3, x: -14, y: 6.8, z: -12 },
    { color: 0xffc45f, intensity: 230, reflectionLength: 13, reflectionWidth: 7, rotation: -0.36, x: 14, y: 7.2, z: -12 },
    { color: 0xff718f, intensity: 190, reflectionLength: 12, reflectionWidth: 6.5, rotation: -0.25, x: -14, y: 6.2, z: 12 },
    { color: 0x8eff65, intensity: 205, reflectionLength: 12, reflectionWidth: 6.5, rotation: 0.34, x: 14, y: 6.5, z: 12 },
  ];
  const lamps = lampConfigs.map((config) => addLamp(root, reflectionTexture, config));
  const lightPools = lamps.map((lamp) => ({ color: lamp.color, radius: lamp.x === 0 && lamp.z === 0 ? 13 : 10, x: lamp.x, z: lamp.z }));

  const impacts = new RainImpactField({ parent: root, surfaces, lightPools, seed: seed + 101 });
  const lens = createRainLens(mount, seed + 211);
  const dryFloorColor = new THREE.Color(0x59616b);
  const wetFloorColor = new THREE.Color(0x222a31);
  let displayedWetness = 0;

  return {
    get activeImpacts() {
      return impacts.activeCount;
    },
    dispose() {
      lens.dispose();
      scene.remove(root);
    },
    focus: root.position.clone().add(new THREE.Vector3(0, FLOOR_TOP, 0)),
    root,
    vegetationMask: (x, z) => (
      Math.abs(x - root.position.x) > FLOOR_SIZE * 0.55
      || Math.abs(z - root.position.z) > FLOOR_SIZE * 0.55
    ),
    update(delta, weather, lightningIntensity = 0) {
      const surface = weather?.surface ?? {};
      const precipitation = weather?.precipitation ?? {};
      const atmosphere = weather?.atmosphere ?? {};
      const targetWetness = THREE.MathUtils.clamp(Number(surface.wetness) || 0, 0, 1);
      displayedWetness = smoothToward(displayedWetness, targetWetness, targetWetness > displayedWetness ? 2.4 : 0.65, delta);
      const wetCurve = Math.pow(displayedWetness, 0.78);
      const rainIntensity = RAIN_IMPACT_TYPES.has(precipitation.type)
        ? THREE.MathUtils.clamp(Number(precipitation.intensity) || 0, 0, 1)
        : 0;
      const darkness = THREE.MathUtils.clamp(Number(atmosphere.skyDarkening) || 0, 0, 1);

      floorMaterial.color.copy(dryFloorColor).lerp(wetFloorColor, wetCurve);
      floorMaterial.roughness = THREE.MathUtils.lerp(0.86, 0.075, wetCurve);
      floorMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.64, 0.045, wetCurve);
      for (const entry of reactiveMaterials) {
        entry.material.color.copy(entry.dryColor).lerp(entry.wetColor, wetCurve);
        entry.material.roughness = THREE.MathUtils.lerp(entry.dryRoughness, entry.wetRoughness, wetCurve);
        entry.material.clearcoatRoughness = THREE.MathUtils.lerp(
          entry.dryClearcoatRoughness,
          entry.wetClearcoatRoughness,
          wetCurve,
        );
      }
      for (let index = 0; index < puddles.length; index += 1) {
        const threshold = index * 0.08;
        puddles[index].material.opacity = Math.max(wetCurve - threshold, 0) * 0.032;
      }
      for (const lamp of lamps) {
        lamp.point.intensity = lamp.baseIntensity
          * (0.78 + darkness * 0.68 + wetCurve * 0.1)
          * (1 + Math.min(lightningIntensity * 0.04, 0.3));
        lamp.beamMaterial.opacity = rainIntensity * (0.014 + darkness * 0.024) * lamp.reflectionStrength;
        lamp.reflectionMaterial.opacity = (0.006 + wetCurve * 0.36)
          * (0.72 + darkness * 0.65)
          * lamp.reflectionStrength;
      }
      impacts.update(delta, weather);
      lens.update(delta, precipitation, displayedWetness);
    },
  };
}
