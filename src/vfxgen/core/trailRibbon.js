// Motion-trail ribbon for weapon swings — tuned to the reference-class
// action-RPG look (Genshin-style): a SOLID, unlit, two-band surface (flat
// saturated body + crisp white leading edge) whose tail ERODES with a hard
// dissolving cutoff instead of fading translucent, over a Catmull-Rom
// smoothed centerline so fast arcs stay round instead of polygonal. The
// newest segments flash white along the blade — the "charged edge" while
// the swing is live.
//
// Each frame the CPU appends ONE raw pair of world-space vertices (blade
// base and tip) and the sampler expands it into SUBDIV spline-interpolated
// pairs; the fragment shader erodes each written segment by its age. CPU
// cost per active trail per frame: ~40 floats and a small memmove.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  attribute, cameraPosition, clamp, distance, exp, Fn, max, mix, smoothstep,
  positionWorld, uniform, vec3, vec4,
} from 'three/tsl';

import { celBands } from './spriteShapes.js';

const baseScratch = new THREE.Vector3();
const tipScratch = new THREE.Vector3();
const crScratch = new THREE.Vector3();

/** Catmull-Rom point for control points p0..p3 at t in [0,1], into `out`. */
function catmullRom(out, p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const axis of ['x', 'y', 'z']) {
    out[axis] = 0.5 * (
      2 * p1[axis]
      + (-p0[axis] + p2[axis]) * t
      + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
      + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
    );
  }
  return out;
}

// Spline points emitted per raw frame sample — the smoothing factor.
const SUBDIV = 3;

/**
 * One pooled ribbon. `sharedUniforms` is the burst backbone's uniform set —
 * the ribbon reads uTime and the fog quartet from it so every VFX layer
 * shares one clock and one fog state.
 */
export function createTrailRibbon({ segments = 96, sharedUniforms }) {
  const capacity = Math.max(Math.round(segments), 8);
  const vertexCount = capacity * 2;
  const u = sharedUniforms;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertexCount * 3);
  // Per-vertex (birth, edge): edge 0 = blade base, 1 = tip.
  const trailData = new Float32Array(vertexCount * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aTrail', new THREE.BufferAttribute(trailData, 2).setUsage(THREE.DynamicDrawUsage));
  const indices = new Uint16Array((capacity - 1) * 6);
  for (let i = 0; i < capacity - 1; i += 1) {
    const v = i * 2;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  // Per-ribbon look uniforms — pooled ribbons re-tint on acquire.
  const look = {
    uBands: uniform(6),
    uBodyColor: uniform(new THREE.Color(1.0, 0.78, 0.2)),
    uEdgeBandColor: uniform(new THREE.Color(1, 1, 1)),
    uIntensity: uniform(1),
    uLifetime: uniform(0.3),
  };

  const material = new NodeMaterial();
  material.name = 'VfxTrailRibbon';
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;
  // Positions are written in world space; the default vertex path is correct
  // with the mesh at identity. Only the fragment is custom.
  material.fragmentNode = Fn(() => {
    const trail = attribute('aTrail', 'vec2');
    const age = u.uTime.sub(trail.x);
    const fade = clamp(age.div(max(look.uLifetime, 1e-3)), 0.0, 1.0).oneMinus();

    // EROSION, not transparency: the surface stays solid and the tail
    // dissolves with a hard swept cutoff, inner (base) edge first — that
    // tapering crescent is the reference read. Partially quantizing the
    // sweep into cel bands gives the stepped hand-drawn tail.
    const fadeStepped = mix(fade, celBands(fade, look.uBands), 0.4);
    const erode = smoothstep(0.0, 0.12,
      fadeStepped.mul(1.2).sub(trail.y.oneMinus().mul(0.22)));

    // Two hard bands across the width: white leading edge, saturated body.
    const band = smoothstep(0.7, 0.84, trail.y);
    const color = mix(look.uBodyColor, look.uEdgeBandColor, band).toVar();
    // Newest segments flash white along the blade — the live charged edge.
    color.assign(mix(color, vec3(1.0), smoothstep(0.05, 0.0, age).mul(0.85)));
    color.mulAssign(look.uIntensity);

    // Solid surfaces join the fog by TINT (like the dust), not by dimming.
    const heightFalloff = exp(
      max(positionWorld.y.sub(u.uFogFloorY), 0.0).div(max(u.uFogFalloff, 0.001)).negate());
    const depthTerm = exp(distance(positionWorld, cameraPosition).mul(u.uFogDensity).negate()).oneMinus();
    const fogged = mix(color, u.uFogColor, clamp(depthTerm.mul(heightFalloff), 0.0, 1.0));

    return vec4(fogged, erode.mul(0.96));
  })();
  material.uniforms = look;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'VfxTrailRibbon';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;

  let samples = 0;
  let active = false;
  let lastBirth = -Infinity;
  let lastRawTime = -Infinity;
  let follow = null;
  const baseAnchor = new THREE.Vector3();
  const tipAnchor = new THREE.Vector3(0, 1, 0);
  const minStep = 0.015;
  // Rolling raw history for the spline: [older, prev, newest].
  const rawBase = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const rawTip = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let rawCount = 0;

  const writeSample = (index, base, tip, birth) => {
    positions.set([base.x, base.y, base.z, tip.x, tip.y, tip.z], index * 6);
    trailData.set([birth, 0, birth, 1], index * 4);
  };

  const appendPair = (base, tip, birth) => {
    if (samples === capacity) {
      positions.copyWithin(0, 6);
      trailData.copyWithin(0, 4);
      samples -= 1;
    }
    writeSample(samples, base, tip, birth);
    samples += 1;
  };

  const markDirty = () => {
    geometry.setDrawRange(0, Math.max(samples - 1, 0) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aTrail.needsUpdate = true;
  };

  const pushRaw = (base, tip) => {
    rawBase[0].copy(rawBase[1]); rawBase[1].copy(rawBase[2]); rawBase[2].copy(base);
    rawTip[0].copy(rawTip[1]); rawTip[1].copy(rawTip[2]); rawTip[2].copy(tip);
    rawCount = Math.min(rawCount + 1, 3);
  };

  const ribbon = {
    mesh,

    get active() { return active; },
    get samples() { return samples; },

    /**
     * Arms the ribbon on a followed Object3D. `base`/`tip` are LOCAL anchor
     * points on the followed object (blade root and blade tip).
     */
    begin({ follow: target, base = [0, 0, 0], tip = [0, 1, 0], color, coreColor, lifetime, bands, intensity } = {}) {
      follow = target ?? null;
      baseAnchor.fromArray(base);
      tipAnchor.fromArray(tip);
      if (Array.isArray(color)) look.uBodyColor.value.setRGB(...color, THREE.SRGBColorSpace);
      if (Array.isArray(coreColor)) look.uEdgeBandColor.value.setRGB(...coreColor, THREE.SRGBColorSpace);
      if (Number.isFinite(lifetime)) look.uLifetime.value = Math.max(lifetime, 0.02);
      if (Number.isFinite(bands)) look.uBands.value = Math.max(Math.round(bands), 1);
      if (Number.isFinite(intensity)) look.uIntensity.value = Math.max(intensity, 0);
      samples = 0;
      rawCount = 0;
      geometry.setDrawRange(0, 0);
      active = true;
      mesh.visible = true;
      return ribbon;
    },

    /**
     * Per frame while active: sample the followed object's anchors in world
     * space; when the tip moved, append SUBDIV spline-smoothed segment pairs
     * between the previous and current raw samples. Returns the tip position
     * (for the sparkle emitter) or null when idle.
     */
    sample(now) {
      if (!active || !follow?.isObject3D) return null;
      follow.updateWorldMatrix(true, false);
      const base = baseScratch.copy(baseAnchor).applyMatrix4(follow.matrixWorld);
      const tip = tipScratch.copy(tipAnchor).applyMatrix4(follow.matrixWorld);

      if (rawCount > 0) {
        const prevTip = rawTip[2];
        const moved = prevTip.distanceToSquared(tip);
        if (moved < minStep * minStep) {
          // Blade at rest: refresh the head so the ribbon stays attached.
          if (samples > 0) {
            writeSample(samples - 1, base, tip, now);
            markDirty();
          }
          lastBirth = now;
          lastRawTime = now;
          return tip;
        }
      }

      if (rawCount < 2) {
        // Not enough history to spline yet — lay the raw pair directly.
        pushRaw(base, tip);
        appendPair(base, tip, now);
      } else {
        const prevTime = Number.isFinite(lastRawTime) ? lastRawTime : now;
        pushRaw(base, tip);
        // Spline between prev (p1) and newest (p2); p3 extrapolates forward.
        for (let step = 1; step <= SUBDIV; step += 1) {
          const t = step / SUBDIV;
          const birth = prevTime + (now - prevTime) * t;
          const b = catmullRom(crScratch.clone(), rawBase[0], rawBase[1], rawBase[2],
            crScratch.copy(rawBase[2]).multiplyScalar(2).sub(rawBase[1]), t);
          const bx = b.x; const by = b.y; const bz = b.z;
          const tpoint = catmullRom(crScratch, rawTip[0], rawTip[1], rawTip[2],
            tipScratch.copy(rawTip[2]).multiplyScalar(2).sub(rawTip[1]), t);
          appendPair({ x: bx, y: by, z: bz }, tpoint, birth);
        }
      }
      lastBirth = now;
      lastRawTime = now;
      markDirty();
      return tipScratch.copy(tipAnchor).applyMatrix4(follow.matrixWorld);
    },

    /** Stops appending; the written arc erodes out over its lifetime. */
    stop() {
      active = false;
      follow = null;
      return ribbon;
    },

    /** True once inactive AND every written segment has fully faded. */
    isDead(now) {
      return !active && now - lastBirth > look.uLifetime.value + 0.05;
    },

    /** Pool reset — hides the mesh without disposing GPU resources. */
    reset() {
      active = false;
      follow = null;
      samples = 0;
      rawCount = 0;
      lastBirth = -Infinity;
      lastRawTime = -Infinity;
      geometry.setDrawRange(0, 0);
      mesh.visible = false;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
  mesh.visible = false;
  return ribbon;
}
