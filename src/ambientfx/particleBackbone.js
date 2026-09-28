// The ONE shared GPU particle system behind every ambient effect. Same
// architecture as StylizedGrassField: an InstancedBufferGeometry over a unit
// quad, per-instance attributes filled once per (rare) window re-emission,
// and ALL motion computed in the TSL vertex shader as a pure function of
// time — zero per-frame CPU work per particle, works on WebGPU and the
// WebGL2 fallback alike.
//
// Draw calls: the five effects share THREE meshes, grouped by blend state —
// that is the real GPU boundary, not the effect:
//   cutout — petals + leaves     (alpha-test, depth-writing, double-sided)
//   glow   — fireflies + pollen  (additive, no depth write, emissive/unlit)
//   soft   — mist                (alpha blend, no depth write)
// Within a group the per-instance `kind` attribute selects the motion
// program (flutter-fall / tumble-fall / hover-blink / curl-drift / scroll),
// so adding an effect never adds a draw. A single backbone draw for all five
// was rejected: cutout needs depth writes that would occlude through the
// additive glows, and mist's alpha blend cannot share either state.
//
// Budget: ≤ 20k instances of 2 triangles with trig-only vertex work and
// mostly-discard flat fragments — far under the 0.5 ms cluster budget.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, clamp, cos, Discard,
  distance, exp, float, Fn, fract, length, max, mix, modelWorldMatrix, normalize, positionLocal,
  pow, rotate, sin, smoothstep, step, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';

// --- deterministic randomness (shared with emitters + verify script) --------

/** Chris Wellons' lowbias32: uint32 -> well-mixed uint32. */
export function lowbias32(x) {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mixes two uint32 seeds into one (order-sensitive). */
export function hashCombine(a, b) {
  return lowbias32((a >>> 0) ^ (Math.imul(b >>> 0, 0x9e3779b9) >>> 0));
}

/** mulberry32 PRNG: uint32 seed -> () => [0, 1). No Math.random anywhere. */
export function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- effect/window constants -------------------------------------------------

/** Backbone kind ids — the per-instance `iData.w` attribute. */
export const EFFECT_KIND = Object.freeze({ petals: 0, leaves: 1, fireflies: 2, pollen: 3, mist: 4 });

/** Which blend-group mesh each kind renders in. */
export const GROUP_FOR_KIND = Object.freeze({
  petals: 'cutout', leaves: 'cutout', fireflies: 'glow', pollen: 'glow', mist: 'soft',
});

// Follow-window geometry. Emission fills the full windowRadius disk; the
// visual fade ends before (radius − recenter·radius), so by the time the
// window re-centers, every cell that appears or drops is already past the
// fade — mathematically no pop is possible (see stylizedAmbientFx).
export const FADE_START_FRACTION = 0.55;
export const FADE_END_FRACTION = 0.8;
export const RECENTER_FRACTION = 0.18;

// Cutout particles can pass through the camera. Without a near fade, a
// 10 cm petal at a few centimeters distance becomes a screen-sized pink or
// orange blob. Collapse it before that can happen.
export const CUTOUT_NEAR_FADE_METERS = Object.freeze([0.45, 1.35]);

/** CPU mirror of the shader's wind drift heading (for hosts and verify). */
export function windDriftVector(windDirection) {
  const x = Number(windDirection?.[0]) || 0;
  const z = Number(windDirection?.[1]) || 0;
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

// --- geometry helpers --------------------------------------------------------

const FLOATS_PER_INSTANCE = { iSpawn: 3, iData: 4, iColor: 3, iAux: 4 };

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
  // Instances span the whole follow window wherever it goes.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

/**
 * Creates the three blend-group meshes plus their shared uniforms.
 * `settings` is a createAmbientFxSettings() result — only uniform-backed
 * values are read here; emission is the caller's job (see emitters.js).
 *
 * Returned groups expose `setInstances(records)` where each record is
 * `{ x, y, z, seed, phase, size, kind, r, g, b, range, rate, gateJitter,
 * windResponse }` — the emitters produce exactly this shape.
 */
export function createParticleBackbone(settings) {
  const shared = settings.shared;
  const u = {
    uCamRight: uniform(new THREE.Vector3(1, 0, 0)),
    uCamUp: uniform(new THREE.Vector3(0, 1, 0)),
    uCenter: uniform(new THREE.Vector2(0, 0)),
    uFireflyIntensity: uniform(settings.fireflies.intensity),
    uFogColor: uniform(new THREE.Color(0.66, 0.8, 0.94)),
    uFogDensity: uniform(0),
    uFogFalloff: uniform(400),
    uFogFloorY: uniform(0),
    uGateFireflies: uniform(1),
    uGateLeaves: uniform(1),
    uGateMist: uniform(1),
    uGatePetals: uniform(1),
    uGatePollen: uniform(1),
    uMistOpacity: uniform(settings.mist.opacity),
    uPollenBacklit: uniform(settings.pollen.backlitStrength),
    uSunDirection: uniform(new THREE.Vector3(...shared.sunDirection).normalize()),
    uTime: uniform(0),
    uWindDir: uniform(new THREE.Vector2(shared.windDirection[0], shared.windDirection[1])),
    uWindSpeed: uniform(shared.windSpeed),
    uWindStrength: uniform(shared.windStrength),
    uWindowRadius: uniform(shared.windowRadius),
  };

  // Mirror of the environment shader's world-height fog (same formula as the
  // forest far proxies' _fogUniforms): dense near the world floor, thinning
  // with altitude, exponential in view distance. Density 0 disables.
  const heightFogFactor = (worldPos) => {
    const heightFalloff = exp(
      max(worldPos.y.sub(u.uFogFloorY), 0.0).div(max(u.uFogFalloff, 0.001)).negate());
    const depthTerm = exp(distance(worldPos, cameraPosition).mul(u.uFogDensity).negate()).oneMinus();
    return clamp(depthTerm.mul(heightFalloff), 0.0, 1.0);
  };

  // Shared per-instance plumbing: window edge fade around the live follow
  // center + staggered time-gate fade (each particle owns a threshold, so a
  // gate ramping 0→1 pops particles in one by one instead of all at once).
  const windowFade = (worldSpawnXZ) => {
    const dist = length(worldSpawnXZ.sub(u.uCenter));
    return smoothstep(
      u.uWindowRadius.mul(FADE_START_FRACTION),
      u.uWindowRadius.mul(FADE_END_FRACTION),
      dist,
    ).oneMinus();
  };
  const gateFade = (weight, jitter) =>
    clamp(weight.mul(1.15).sub(jitter.mul(0.96)).div(0.12), 0.0, 1.0);

  const buildMaterial = (name, build) => {
    const material = new NodeMaterial();
    material.name = name;
    build(material);
    material.uniforms = u; // GLSL-style named access, matching the grass idiom
    return material;
  };

  // ---- cutout group: petals (flutter-fall) + leaves (tumble-fall) ----------
  const cutoutMaterial = buildMaterial('AmbientFxCutout', (material) => {
    material.side = THREE.DoubleSide;
    material.fog = true; // scene.fog linear layer; height fog added below

    const vUv = uv();
    const vColor = varying(vec3(), 'vFxColor');
    const vSeed = varying(float(), 'vFxSeed');
    const vKind = varying(float(), 'vFxKind');
    const vWorldPos = varying(vec3(), 'vFxWorldPos');

    material.vertexNode = Fn(() => {
      const iSpawn = attribute('iSpawn', 'vec3');
      const iData = attribute('iData', 'vec4');
      const iAux = attribute('iAux', 'vec4');
      const seed = iData.x;
      const isLeaf = step(0.5, iData.w).toVar();
      vSeed.assign(seed);
      vKind.assign(iData.w);
      vColor.assign(attribute('iColor', 'vec3'));

      const t = u.uTime;
      const windDir = normalize(u.uWindDir.add(vec2(1e-4, 0.0))).toVar();
      const windAmp = u.uWindStrength.mul(iAux.w).toVar();

      // Looping fall: each particle forever re-falls its own span (spawn
      // height → ground, precomputed by the emitter). The loop ends collapse
      // the quad so respawns at the top are invisible, never a pop.
      const fallSpan = max(iAux.x, 0.5);
      const fallSpeed = mix(0.5, 1.0, fract(seed.mul(19.7))).mul(mix(1.0, 1.4, isLeaf));
      const progress = fract(iData.y.add(t.mul(fallSpeed).div(fallSpan))).toVar();
      const drop = progress.mul(fallSpan).toVar();

      // Side-to-side flutter (petals rock, leaves slide) + downwind advection
      // that accumulates over the fall + a traveling gust kick for leaves.
      const ph = t.mul(mix(1.4, 2.3, fract(seed.mul(7.7)))).add(seed.mul(41.0)).toVar();
      const amp = iAux.y.mul(mix(0.32, 0.5, fract(seed.mul(3.3)))).toVar();
      const perp = vec2(windDir.y.negate(), windDir.x);
      const sway = perp.mul(sin(ph).mul(amp))
        .add(windDir.mul(sin(ph.mul(0.77).add(1.3)).mul(amp).mul(0.6)))
        .toVar();
      const gust = sin(iSpawn.xz.dot(windDir).mul(0.15).sub(t.mul(u.uWindSpeed).mul(1.5)))
        .mul(0.5).add(0.5);
      const advect = windDir.mul(
        windAmp.mul(drop).mul(1.6).add(gust.mul(windAmp).mul(isLeaf).mul(1.4)),
      );

      // Orientation: petals rock around a lazy yaw; leaves tumble end over
      // end — this rotation is what makes tiny quads read as leaves/petals.
      const yaw = seed.mul(6.2831).add(t.mul(iAux.y).mul(mix(0.6, 1.1, isLeaf)));
      const pitch = mix(
        sin(ph.mul(1.13)).mul(0.8).mul(iAux.y).add(1.1),
        t.mul(iAux.y).mul(2.4).add(seed.mul(6.2831)),
        isLeaf,
      );
      const roll = sin(ph.mul(0.71).add(seed.mul(9.0))).mul(0.6);

      // Fades multiply into the quad SIZE: a degenerate quad rasterizes
      // nothing, so gated/out-of-window particles cost zero fragments.
      const worldSpawn = modelWorldMatrix.mul(vec4(iSpawn, 1.0)).xyz.toVar();
      const endFade = smoothstep(0.0, 0.06, progress)
        .mul(smoothstep(0.92, 1.0, progress).oneMinus());
      const gateW = mix(u.uGatePetals, u.uGateLeaves, isLeaf);
      const anchor = vec3(
        iSpawn.x.add(sway.x).add(advect.x),
        iSpawn.y.sub(drop),
        iSpawn.z.add(sway.y).add(advect.y),
      ).toVar();
      const anchorWorld = modelWorldMatrix.mul(vec4(anchor, 1.0)).xyz;
      const nearFade = smoothstep(
        CUTOUT_NEAR_FADE_METERS[0],
        CUTOUT_NEAR_FADE_METERS[1],
        distance(cameraPosition, anchorWorld),
      );
      const scale = iData.z
        .mul(endFade)
        .mul(windowFade(worldSpawn.xz))
        .mul(gateFade(gateW, iAux.z))
        .mul(nearFade)
        .toVar();

      // PlaneGeometry corners live in local XY; rotate the scaled quad.
      const offset = rotate(positionLocal.mul(scale), vec3(pitch, yaw, roll));
      const position = anchor.add(offset);
      const worldPosition = modelWorldMatrix.mul(vec4(position, 1.0));
      vWorldPos.assign(worldPosition.xyz);
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
    })();

    material.fragmentNode = Fn(() => {
      const isLeaf = step(0.5, vKind);
      const p = vUv.mul(2.0).sub(1.0).toVar();
      // Petal: ellipse with a notch at the outer edge (the classic sakura
      // dimple). Leaf: narrower pointed ellipse with a midrib.
      const petalMask = length(p.mul(vec2(1.0, 1.12)))
        .add(smoothstep(0.35, 0.0, abs(p.x)).mul(max(p.y, 0.0)).mul(0.45));
      const leafMask = length(p.mul(vec2(1.5, 1.0)));
      Discard(mix(petalMask, leafMask, isLeaf).greaterThan(1.0));

      const color = vColor.mul(fract(vSeed.mul(5.1)).mul(0.16).add(0.92)).toVar();
      color.mulAssign(smoothstep(0.12, 0.0, abs(p.x)).mul(isLeaf).mul(0.16).oneMinus());
      // Backlit translucency toward the sun — same trick as the grass tips.
      const viewDirection = normalize(cameraPosition.sub(vWorldPos));
      const backlit = pow(clamp(viewDirection.dot(normalize(u.uSunDirection).negate()), 0.0, 1.0), 3.0);
      color.addAssign(color.mul(backlit).mul(0.3));

      const fogged = mix(color, u.uFogColor, heightFogFactor(vWorldPos));
      return vec4(fogged, 1.0);
    })();
  });

  // ---- glow group: fireflies (hover-blink) + pollen (curl drift) ----------
  // Emissive/unlit by design (fireflies ARE light sources) and additive, so
  // scene fog must not tint them toward the fog color — a fog-colored glow
  // quad ADDS fog-colored light. Instead both fog layers only DIM the glow.
  const glowMaterial = buildMaterial('AmbientFxGlow', (material) => {
    material.transparent = true;
    material.blending = THREE.AdditiveBlending;
    material.depthWrite = false;
    material.fog = false;

    const vUv = uv();
    const vColor = varying(vec3(), 'vFxColor');
    const vSeed = varying(float(), 'vFxSeed');
    const vKind = varying(float(), 'vFxKind');
    const vRate = varying(float(), 'vFxRate');
    const vFade = varying(float(), 'vFxFade');
    const vWorldPos = varying(vec3(), 'vFxWorldPos');

    material.vertexNode = Fn(() => {
      const iSpawn = attribute('iSpawn', 'vec3');
      const iData = attribute('iData', 'vec4');
      const iAux = attribute('iAux', 'vec4');
      const seed = iData.x;
      const isPollen = step(2.5, iData.w).toVar();
      vSeed.assign(seed);
      vKind.assign(iData.w);
      vRate.assign(iAux.y);
      vColor.assign(attribute('iColor', 'vec3'));

      const t = u.uTime;
      // Layered-sine wander: fireflies patrol a small pocket of air, pollen
      // swirls in a lazier, larger orbit keyed to its position (reads as a
      // shared drift field without paying for real curl noise).
      const a = mix(0.7, 1.3, fract(seed.mul(3.1)));
      const b = mix(0.7, 1.3, fract(seed.mul(5.7)));
      const c = mix(0.7, 1.3, fract(seed.mul(9.3)));
      const speed = mix(0.5, 0.24, isPollen);
      const wander = vec3(
        sin(t.mul(speed).mul(a).add(seed.mul(40.0)).add(iSpawn.z.mul(isPollen).mul(0.4))),
        sin(t.mul(speed).mul(0.8).mul(b).add(seed.mul(71.0))).mul(0.55),
        cos(t.mul(speed).mul(0.9).mul(c).add(seed.mul(23.0)).add(iSpawn.x.mul(isPollen).mul(0.35))),
      ).mul(iAux.x).toVar();
      // Bounded, oscillating downwind slide — never walks off the window.
      const windDir = normalize(u.uWindDir.add(vec2(1e-4, 0.0)));
      const slide = sin(t.mul(0.22).add(iData.y.mul(6.2831))).mul(0.5).add(0.5)
        .mul(u.uWindStrength).mul(iAux.w).mul(6.0);
      wander.x.addAssign(windDir.x.mul(slide));
      wander.z.addAssign(windDir.y.mul(slide));

      const anchor = iSpawn.add(wander).toVar();
      const worldSpawn = modelWorldMatrix.mul(vec4(iSpawn, 1.0)).xyz;
      const gateW = mix(u.uGateFireflies, u.uGatePollen, isPollen);
      const fade = windowFade(worldSpawn.xz).mul(gateFade(gateW, iAux.z)).toVar();
      vFade.assign(fade);

      // Camera-facing billboard from CPU-fed basis vectors (backend-safe).
      const scale = iData.z.mul(step(0.001, fade)).mul(fade.mul(0.35).add(0.65));
      const position = anchor
        .add(u.uCamRight.mul(positionLocal.x).mul(scale))
        .add(u.uCamUp.mul(positionLocal.y).mul(scale));
      const worldPosition = modelWorldMatrix.mul(vec4(position, 1.0));
      vWorldPos.assign(worldPosition.xyz);
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
    })();

    material.fragmentNode = Fn(() => {
      const isPollen = step(2.5, vKind);
      const t = u.uTime;
      const d = length(vUv.mul(2.0).sub(1.0)).toVar();
      const halo = pow(clamp(d.oneMinus(), 0.0, 1.0), 1.8).toVar();
      const core = pow(clamp(d.oneMinus(), 0.0, 1.0), 6.0).toVar();

      // Blink: the product of two incommensurate sines thresholded gives the
      // irregular firefly pulse; a small floor keeps a faint ember between
      // blinks so motes never teleport visually.
      const blinkT = sin(t.mul(vRate).mul(1.1).add(vSeed.mul(251.0))).mul(0.5).add(0.5)
        .mul(sin(t.mul(vRate).mul(0.37).add(vSeed.mul(97.0))).mul(0.5).add(0.5));
      const blink = smoothstep(0.22, 0.55, blinkT).mul(0.94).add(0.06);

      // Pollen: steady soft twinkle + strong boost looking toward the sun.
      const viewDirection = normalize(cameraPosition.sub(vWorldPos));
      const backlit = pow(clamp(viewDirection.dot(normalize(u.uSunDirection).negate()), 0.0, 1.0), 2.5);
      const twinkle = sin(t.mul(vRate).add(vSeed.mul(151.0))).mul(0.18).add(0.82);
      // Base bright enough to sparkle over sunlit grass; backlit doubles it.
      const pollenBrightness = twinkle.mul(backlit.mul(u.uPollenBacklit).mul(2.2).add(0.85));

      const brightness = mix(blink.mul(u.uFireflyIntensity).mul(2.0), pollenBrightness, isPollen);
      const rgb = vColor.mul(halo).add(vec3(1.0).mul(core).mul(mix(0.8, 0.25, isPollen)))
        .mul(brightness)
        .mul(vFade)
        .mul(heightFogFactor(vWorldPos).oneMinus());
      return vec4(rgb, halo);
    })();
  });

  // ---- soft group: mist wisps (horizontal scroll) ---------------------------
  const softMaterial = buildMaterial('AmbientFxSoft', (material) => {
    material.transparent = true;
    material.depthWrite = false;
    material.fog = true;

    const vUv = uv();
    const vColor = varying(vec3(), 'vFxColor');
    const vSeed = varying(float(), 'vFxSeed');
    const vFade = varying(float(), 'vFxFade');
    const vWorldPos = varying(vec3(), 'vFxWorldPos');

    material.vertexNode = Fn(() => {
      const iSpawn = attribute('iSpawn', 'vec3');
      const iData = attribute('iData', 'vec4');
      const iAux = attribute('iAux', 'vec4');
      const seed = iData.x;
      vSeed.assign(seed);
      vColor.assign(attribute('iColor', 'vec3'));

      const t = u.uTime;
      const windDir = normalize(u.uWindDir.add(vec2(1e-4, 0.0)));
      // Scroll a wisp downwind across its span, wrap, fade at both ends.
      const s = fract(iData.y.add(t.mul(u.uWindSpeed).mul(iAux.w).mul(0.02))).toVar();
      const travel = s.sub(0.5).mul(iAux.x);
      const bob = sin(t.mul(iAux.y).add(seed.mul(37.0))).mul(0.22);
      const anchor = vec3(
        iSpawn.x.add(windDir.x.mul(travel)),
        iSpawn.y.add(bob),
        iSpawn.z.add(windDir.y.mul(travel)),
      ).toVar();

      const worldSpawn = modelWorldMatrix.mul(vec4(iSpawn, 1.0)).xyz;
      const endFade = smoothstep(0.0, 0.18, s).mul(smoothstep(0.82, 1.0, s).oneMinus());
      const fade = windowFade(worldSpawn.xz)
        .mul(gateFade(u.uGateMist, iAux.z))
        .mul(endFade)
        .toVar();
      vFade.assign(fade);

      // Y-axis billboard: wisps stay upright and face the camera in plan
      // only, so they read as layers of ground haze from any walk-height view.
      const toCam = cameraPosition.sub(anchor);
      const right = normalize(vec3(toCam.z, 0.0, toCam.x.negate()).add(vec3(1e-4, 0.0, 0.0)));
      const width = iData.z.mul(fract(seed.mul(2.7)).mul(2.6).add(4.0));
      const grow = step(0.001, fade);
      const position = anchor
        .add(right.mul(positionLocal.x).mul(width).mul(grow))
        .add(vec3(0.0, 1.0, 0.0).mul(positionLocal.y.add(0.35)).mul(iData.z).mul(grow));
      const worldPosition = modelWorldMatrix.mul(vec4(position, 1.0));
      vWorldPos.assign(worldPosition.xyz);
      return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
    })();

    material.fragmentNode = Fn(() => {
      const t = u.uTime;
      const p = vUv.mul(2.0).sub(1.0);
      const body = pow(clamp(length(p.mul(vec2(1.0, 1.2))).oneMinus(), 0.0, 1.0), 1.5);
      // Two drifting ripples across the quad break the "airbrushed ellipse"
      // read into something wispy without a noise texture.
      const ripple = sin(vUv.x.mul(9.0).add(t.mul(0.4)).add(vSeed.mul(63.0))).mul(0.5).add(0.5)
        .mul(sin(vUv.x.mul(4.0).sub(t.mul(0.23)).add(vSeed.mul(29.0))).mul(0.5).add(0.5));
      const alpha = body
        .mul(ripple.mul(0.5).add(0.62))
        .mul(u.uMistOpacity)
        .mul(fract(vSeed.mul(9.3)).mul(0.3).add(0.7))
        .mul(vFade);

      const lit = mix(vColor.mul(0.94), vColor.mul(1.08), vUv.y);
      const fogged = mix(lit, u.uFogColor, heightFogFactor(vWorldPos));
      return vec4(fogged, alpha);
    })();
  });

  const buildGroup = (id, material, capacity, renderOrder) => {
    const mesh = new THREE.Mesh(createGroupGeometry(capacity), material);
    mesh.name = `AmbientFx${id[0].toUpperCase()}${id.slice(1)}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    const group = {
      capacity: Math.max(capacity, 1),
      count: 0,
      id,
      mesh,
      setInstances(records) {
        if (records.length > group.capacity) {
          group.capacity = Math.ceil(records.length * 1.3);
          for (const [name, itemSize] of Object.entries(FLOATS_PER_INSTANCE)) {
            mesh.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(
              new Float32Array(group.capacity * itemSize), itemSize));
          }
        }
        const spawn = mesh.geometry.attributes.iSpawn;
        const data = mesh.geometry.attributes.iData;
        const color = mesh.geometry.attributes.iColor;
        const aux = mesh.geometry.attributes.iAux;
        records.forEach((r, i) => {
          spawn.array[i * 3] = r.x; spawn.array[i * 3 + 1] = r.y; spawn.array[i * 3 + 2] = r.z;
          data.array[i * 4] = r.seed; data.array[i * 4 + 1] = r.phase;
          data.array[i * 4 + 2] = r.size; data.array[i * 4 + 3] = r.kind;
          color.array[i * 3] = r.r; color.array[i * 3 + 1] = r.g; color.array[i * 3 + 2] = r.b;
          aux.array[i * 4] = r.range; aux.array[i * 4 + 1] = r.rate;
          aux.array[i * 4 + 2] = r.gateJitter; aux.array[i * 4 + 3] = r.windResponse;
        });
        spawn.needsUpdate = data.needsUpdate = color.needsUpdate = aux.needsUpdate = true;
        mesh.geometry.instanceCount = records.length;
        group.count = records.length;
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
      cutout: buildGroup('cutout', cutoutMaterial, 2048, 1),
      // Mist under the glows so fireflies shine THROUGH the haze layer.
      soft: buildGroup('soft', softMaterial, 64, 2),
      glow: buildGroup('glow', glowMaterial, 1024, 3),
    },
    uniforms: u,
  };
}
