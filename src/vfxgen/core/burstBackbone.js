// The ONE shared GPU system behind every one-shot burst in the VFX cluster
// (sparks, embers, hit flashes, ground rings, dust puffs). Same architecture
// as the ambientfx particle backbone: an InstancedBufferGeometry over a unit
// quad and ALL motion computed in the TSL vertex shader as a pure function of
// (uTime − birth) — after the spawn-time attribute write, a burst costs zero
// CPU per frame, on WebGPU and the WebGL2 fallback alike.
//
// Where ambientfx re-emits a follow window, this is a RING BUFFER: spawns
// write records at a cursor and expired instances collapse to degenerate
// quads in the vertex shader (zero fragments) until overwritten. Draw calls:
// every effect shares TWO meshes, grouped by blend state —
//   glow — sparks + embers + flashes + rings  (additive, no depth write)
//   puff — dust/smoke puffs                   (alpha blend, no depth write)
// Within a group the per-instance `kind` attribute selects the motion
// program (ballistic / buoyant-wander / flash-pop / ground-ring / puff), so
// adding an effect never adds a draw.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, clamp, cos, Discard,
  distance, exp, float, Fn, max, mix, normalize, positionLocal, pow, sin, smoothstep, step,
  uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';

import { emberDot, puffBlob, ringBand, softDot, starburst } from './spriteShapes.js';

/** Backbone kind ids — the per-instance `iData.w` attribute. `ring` lies
 * flat on the ground (scorch); `shockwave` is the same expanding band but
 * camera-facing (the action-RPG hit circle). */
export const BURST_KIND = Object.freeze({
  spark: 0, ember: 1, flash: 2, ring: 3, puff: 4, shockwave: 5,
});

/** Which blend-group mesh each kind renders in. */
export const GROUP_FOR_BURST_KIND = Object.freeze({
  spark: 'glow', ember: 'glow', flash: 'glow', ring: 'glow', puff: 'puff', shockwave: 'glow',
});

// --- geometry ----------------------------------------------------------------

const FLOATS_PER_INSTANCE = { iSpawn: 3, iVel: 3, iData: 4, iColor: 3, iAux: 4 };

function createGroupGeometry(capacity) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('uv', quad.attributes.uv);
  for (const [name, itemSize] of Object.entries(FLOATS_PER_INSTANCE)) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(
      new Float32Array(Math.max(capacity, 1) * itemSize), itemSize));
  }
  geometry.instanceCount = 0;
  // Bursts happen anywhere in the world; never let culling clip a hit flash.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

/**
 * Creates the two blend-group meshes plus their shared uniforms.
 *
 * Each group exposes `emit(records)` where a record is
 * `{ x, y, z, vx, vy, vz, seed, birth, lifetime, kind, r, g, b,
 *    size0, size1, gravity, extra }` — the effects/ builders produce exactly
 * this shape. `extra` is kind-specific: spark → streak stretch, ember →
 * wander radius, flash → star spikes, ring → band thickness, puff → spin.
 */
export function createBurstBackbone(settings) {
  const capacity = Math.max(settings?.shared?.maxParticles ?? 4096, 64);
  // Glow kinds outnumber puffs in practice (sparks + embers per burst vs a
  // handful of dust quads); split the budget accordingly.
  const glowCapacity = Math.ceil(capacity * 0.75);
  const puffCapacity = Math.max(capacity - glowCapacity, 32);

  const u = {
    uCamRight: uniform(new THREE.Vector3(1, 0, 0)),
    uCamUp: uniform(new THREE.Vector3(0, 1, 0)),
    uFogColor: uniform(new THREE.Color(0.66, 0.8, 0.94)),
    uFogDensity: uniform(0),
    uFogFalloff: uniform(400),
    uFogFloorY: uniform(0),
    uTime: uniform(0),
  };

  // Mirror of the environment shader's world-height fog (same formula as the
  // ambientfx backbone) so bursts haze out with the terrain. Density 0 = off.
  const heightFogFactor = (worldPos) => {
    const heightFalloff = exp(
      max(worldPos.y.sub(u.uFogFloorY), 0.0).div(max(u.uFogFalloff, 0.001)).negate());
    const depthTerm = exp(distance(worldPos, cameraPosition).mul(u.uFogDensity).negate()).oneMinus();
    return clamp(depthTerm.mul(heightFalloff), 0.0, 1.0);
  };

  // Shared per-instance lifecycle: progress 0..1 over the lifetime, and an
  // alive gate that multiplies into quad SIZE — a degenerate quad rasterizes
  // nothing, so expired ring-buffer slots cost zero fragments.
  const lifecycle = () => {
    const iData = attribute('iData', 'vec4');
    const age = u.uTime.sub(iData.y).toVar();
    const lifetime = max(iData.z, 1e-3);
    const progress = clamp(age.div(lifetime), 0.0, 1.0).toVar();
    // −5 ms tolerance: float32 rounding of birth vs the clock must never
    // hide a burst on its own spawn frame (hit flashes land THIS frame).
    const alive = step(-0.005, age)
      .mul(step(age.div(lifetime), 0.9995).toVar())
      .mul(step(1e-3, iData.z));
    return { age, alive, progress, seed: iData.x, kind: iData.w };
  };

  const buildMaterial = (name, build) => {
    const material = new NodeMaterial();
    material.name = name;
    build(material);
    material.uniforms = u; // GLSL-style named access, matching the grass idiom
    return material;
  };

  // ---- glow group: spark (ballistic) + ember (buoyant wander) + flash
  // (scale pop) + ring (ground expand) — additive, emissive by design -------
  const glowMaterial = buildMaterial('VfxBurstGlow', (material) => {
    material.transparent = true;
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
    material.fog = false; // both fog layers only DIM the glow (see ambientfx)

    const vUv = uv();
    const vColor = varying(vec3(), 'vVfxColor');
    const vSeed = varying(float(), 'vVfxSeed');
    const vKind = varying(float(), 'vVfxKind');
    const vProgress = varying(float(), 'vVfxProgress');
    const vExtra = varying(float(), 'vVfxExtra');
    const vWorldPos = varying(vec3(), 'vVfxWorldPos');

    material.vertexNode = Fn(() => {
      const iSpawn = attribute('iSpawn', 'vec3');
      const iVel = attribute('iVel', 'vec3');
      const iAux = attribute('iAux', 'vec4');
      const { age, alive, progress, seed, kind } = lifecycle();
      vSeed.assign(seed);
      vKind.assign(kind);
      vProgress.assign(progress);
      vExtra.assign(iAux.w);
      vColor.assign(attribute('iColor', 'vec3'));

      const isEmber = step(0.5, kind).mul(step(kind, 1.5));
      const isFlash = step(1.5, kind).mul(step(kind, 2.5));
      const isRing = step(2.5, kind).mul(step(kind, 3.5)); // ground scorch only
      const isShock = step(4.5, kind); // camera-facing hit circle
      const isRingLike = max(isRing, isShock);
      const isBallistic = step(kind, 1.5); // spark or ember

      // Ballistic center: p = p0 + v·t − ½g·t²ŷ. Ember "gravity" is negative
      // (buoyant), so the same program rises; its wander adds a curl-ish
      // drift that grows over life (extra = wander radius).
      const wander = vec3(
        sin(age.mul(3.1).add(seed.mul(41.0))),
        0.0,
        cos(age.mul(2.6).add(seed.mul(23.0))),
      ).mul(iAux.w).mul(progress).mul(isEmber);
      const center = iSpawn
        .add(iVel.mul(age).mul(isBallistic))
        .sub(vec3(0.0, 1.0, 0.0).mul(iAux.z).mul(age).mul(age).mul(0.5).mul(isBallistic))
        .add(wander)
        .toVar();

      // Size envelope per kind. Flash pops out fast and dies before the end
      // of its lifetime; the ring eases outward (shockwave decelerating).
      const easeOut = progress.oneMinus().pow(3.0).oneMinus();
      const sizeBallistic = mix(iAux.x, iAux.y, progress);
      const sizeFlash = iAux.x
        .mul(smoothstep(0.0, 0.22, progress).mul(0.65).add(0.35))
        .mul(smoothstep(1.0, 0.55, progress));
      const sizeRing = mix(iAux.x, iAux.y, easeOut);
      const scale = mix(mix(sizeBallistic, sizeFlash, isFlash), sizeRing, isRingLike)
        .mul(alive)
        .toVar();

      // Sparks stretch into streaks along their CURRENT velocity projected
      // into the camera plane — rotation built from the normalized 2D vector,
      // no atan needed. Everything else keeps the plain billboard basis.
      const velNow = iVel.sub(vec3(0.0, iAux.z.mul(age), 0.0));
      const projected = vec2(velNow.dot(u.uCamRight), velNow.dot(u.uCamUp)).add(vec2(1e-4, 0.0));
      const isSpark = step(kind, 0.5);
      const dir = mix(vec2(1.0, 0.0), normalize(projected), isSpark).toVar();
      const stretch = mix(1.0, max(iAux.w, 1.0), isSpark);
      const local = vec2(positionLocal.x.mul(stretch), positionLocal.y).toVar();
      const rotated = vec2(
        local.x.mul(dir.x).sub(local.y.mul(dir.y)),
        local.x.mul(dir.y).add(local.y.mul(dir.x)),
      );
      const billboardOffset = u.uCamRight.mul(rotated.x).add(u.uCamUp.mul(rotated.y));
      // Scorch rings lie flat on the ground (quad local XY → world XZ);
      // shockwaves keep the camera-facing billboard basis.
      const flatOffset = vec3(positionLocal.x, 0.0, positionLocal.y.negate());
      const offset = mix(billboardOffset, flatOffset, isRing).mul(scale);

      const worldPosition = vec4(center.add(offset), 1.0);
      vWorldPos.assign(worldPosition.xyz);
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
    })();

    material.fragmentNode = Fn(() => {
      const p = vUv.mul(2.0).sub(1.0).toVar();
      const isEmber = step(0.5, vKind).mul(step(vKind, 1.5));
      const isFlash = step(1.5, vKind).mul(step(vKind, 2.5));
      const isRing = step(2.5, vKind);
      const isSpark = step(vKind, 0.5);

      // Ring band thins as it expands (vExtra = starting thickness).
      const thickness = max(vExtra.mul(vProgress.mul(0.6).oneMinus()), 0.02);
      const mask = softDot(p, 2.2).mul(isSpark)
        .add(emberDot(p).mul(isEmber))
        .add(starburst(p, vExtra, 3.0).mul(isFlash))
        .add(ringBand(p, 0.72, thickness).mul(isRing))
        .toVar();

      // Brightness envelopes: sparks/embers cool, the flash dies fast, the
      // ring fades as it runs out of energy.
      const fade = vProgress.oneMinus();
      const brightness = pow(fade, 1.5).mul(isSpark)
        .add(fade.mul(isEmber))
        .add(smoothstep(1.0, 0.45, vProgress).mul(isFlash))
        .add(pow(fade, 1.2).mul(isRing));

      const rgb = vColor.mul(mask).mul(brightness)
        .mul(heightFogFactor(vWorldPos).oneMinus());
      return vec4(rgb, mask.mul(brightness));
    })();
  });

  // ---- puff group: chunky toon dust/smoke — alpha blend, matter not light --
  const puffMaterial = buildMaterial('VfxBurstPuff', (material) => {
    material.transparent = true;
    material.depthWrite = false;
    material.fog = true;

    const vUv = uv();
    const vColor = varying(vec3(), 'vVfxColor');
    const vSeed = varying(float(), 'vVfxSeed');
    const vProgress = varying(float(), 'vVfxProgress');
    const vSpin = varying(float(), 'vVfxSpin');
    const vAge = varying(float(), 'vVfxAge');
    const vWorldPos = varying(vec3(), 'vVfxWorldPos');

    material.vertexNode = Fn(() => {
      const iSpawn = attribute('iSpawn', 'vec3');
      const iVel = attribute('iVel', 'vec3');
      const iAux = attribute('iAux', 'vec4');
      const { age, alive, progress, seed } = lifecycle();
      vSeed.assign(seed);
      vProgress.assign(progress);
      vSpin.assign(iAux.w);
      vAge.assign(age);
      vColor.assign(attribute('iColor', 'vec3'));

      // Decelerating launch (dust loses momentum fast) + gravity term the
      // emitters use as gentle rise (negative) or settle (positive).
      const decel = progress.mul(0.55).oneMinus();
      const center = iSpawn
        .add(iVel.mul(age).mul(decel))
        .sub(vec3(0.0, 1.0, 0.0).mul(iAux.z).mul(age).mul(age).mul(0.5))
        .toVar();

      // Puffs GROW as they fade — the classic smoke read.
      const easeOut = progress.oneMinus().pow(2.0).oneMinus();
      const scale = mix(iAux.x, iAux.y, easeOut).mul(alive);
      const position = center
        .add(u.uCamRight.mul(positionLocal.x).mul(scale))
        .add(u.uCamUp.mul(positionLocal.y).mul(scale));
      const worldPosition = vec4(position, 1.0);
      vWorldPos.assign(worldPosition.xyz);
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
    })();

    material.fragmentNode = Fn(() => {
      // Slow tumble sells hand-drawn smoke; rotate the sample space, not the
      // quad, so the billboard basis stays camera-true.
      const spinAngle = vAge.mul(vSpin).add(vSeed.mul(6.2831));
      const c = cos(spinAngle);
      const s = sin(spinAngle);
      const p0 = vUv.mul(2.0).sub(1.0).toVar();
      const p = vec2(p0.x.mul(c).sub(p0.y.mul(s)), p0.x.mul(s).add(p0.y.mul(c))).toVar();

      const blob = puffBlob(p, vSeed, 0.2);
      Discard(blob.lessThan(0.0));
      const coverage = smoothstep(0.0, 0.14, blob);

      // Two-tone toon shading (lit top, shaded belly) + a stepped-ish fade so
      // the dissolve reads as cel steps rather than an airbrush.
      const shade = mix(0.8, 1.12, smoothstep(-0.7, 0.7, p0.y));
      const fade = vProgress.oneMinus();
      const alpha = coverage
        .mul(smoothstep(0.0, 0.12, fade))
        .mul(pow(fade, 0.75))
        .mul(0.88);

      const lit = vColor.mul(shade);
      const fogged = mix(lit, u.uFogColor, heightFogFactor(vWorldPos));
      return vec4(fogged, alpha);
    })();
  });

  const buildGroup = (id, material, groupCapacity, renderOrder) => {
    const mesh = new THREE.Mesh(createGroupGeometry(groupCapacity), material);
    mesh.name = `VfxBurst${id[0].toUpperCase()}${id.slice(1)}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    // CPU mirror of each slot's lifecycle so stats/verify can count live
    // instances without reading GPU state. Float64 on purpose: float32
    // rounding can push a birth a hair past the clock and make a just-spawned
    // instance read as unborn.
    const birth = new Float64Array(groupCapacity);
    const lifetime = new Float64Array(groupCapacity);
    const group = {
      capacity: groupCapacity,
      cursor: 0,
      highWater: 0,
      id,
      mesh,
      /** Writes records at the ring cursor; oldest slots recycle first. */
      emit(records) {
        const spawn = mesh.geometry.attributes.iSpawn;
        const vel = mesh.geometry.attributes.iVel;
        const data = mesh.geometry.attributes.iData;
        const color = mesh.geometry.attributes.iColor;
        const aux = mesh.geometry.attributes.iAux;
        for (const r of records) {
          const i = group.cursor;
          spawn.array[i * 3] = r.x; spawn.array[i * 3 + 1] = r.y; spawn.array[i * 3 + 2] = r.z;
          vel.array[i * 3] = r.vx ?? 0; vel.array[i * 3 + 1] = r.vy ?? 0; vel.array[i * 3 + 2] = r.vz ?? 0;
          data.array[i * 4] = r.seed; data.array[i * 4 + 1] = r.birth;
          data.array[i * 4 + 2] = r.lifetime; data.array[i * 4 + 3] = r.kind;
          color.array[i * 3] = r.r; color.array[i * 3 + 1] = r.g; color.array[i * 3 + 2] = r.b;
          aux.array[i * 4] = r.size0; aux.array[i * 4 + 1] = r.size1;
          aux.array[i * 4 + 2] = r.gravity ?? 0; aux.array[i * 4 + 3] = r.extra ?? 0;
          birth[i] = r.birth;
          lifetime[i] = r.lifetime;
          group.cursor = (i + 1) % group.capacity;
          group.highWater = Math.min(Math.max(group.highWater, i + 1), group.capacity);
        }
        if (records.length > 0) {
          spawn.needsUpdate = vel.needsUpdate = data.needsUpdate = true;
          color.needsUpdate = aux.needsUpdate = true;
          mesh.geometry.instanceCount = group.highWater;
        }
      },
      /** Instances still inside their lifetime at clock `now`. */
      liveCount(now) {
        let live = 0;
        for (let i = 0; i < group.highWater; i += 1) {
          if (lifetime[i] > 0 && now - birth[i] >= 0 && now - birth[i] < lifetime[i]) live += 1;
        }
        return live;
      },
      clear() {
        lifetime.fill(0);
        mesh.geometry.attributes.iData.array.fill(0);
        mesh.geometry.attributes.iData.needsUpdate = true;
        group.cursor = 0;
        group.highWater = 0;
        mesh.geometry.instanceCount = 0;
      },
      dispose() {
        mesh.geometry.dispose();
        material.dispose();
      },
    };
    return group;
  };

  return {
    groups: {
      // Dust under the glows so sparks and flashes shine THROUGH the smoke.
      puff: buildGroup('puff', puffMaterial, puffCapacity, 4),
      glow: buildGroup('glow', glowMaterial, glowCapacity, 5),
    },
    uniforms: u,
  };
}
