import * as THREE from 'three';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

import { createWaterBreakerNodeMaterial } from '../shaders-tsl/water-breaker.js';
import { WATER_GERSTNER_WAVE_COUNT } from './waterSettings.js';

// Dedicated plunging-breaker geometry. The water heightfield steepens and
// trims waves in the shallows, but a heightfield can never overhang — so
// surfable curling waves need their own mesh. This system:
//
//   1. Finds the break line: the seabed contour at the depth where the swell
//      reaches its collapse criterion (crest = 0.72 x column depth), via
//      marching squares over the bed sampler.
//   2. Keeps only wave-facing stretches (where the swell actually travels
//      toward the shallows) and sweeps a ribbon of profile columns along them.
//   3. Shapes the ribbon in the vertex shader into a curling wave shell,
//      phase-locked to the dominant Gerstner component so barrels arrive with
//      the rendered swell and peel down the line.
//
// The shell is purely visual — buoyancy/height queries still come from the
// heightfield mirror, which the shell's skirt is glued to.

const PROFILE_ROWS = 15;
const COLUMN_SPACING = 0.8;
const END_FADE_DISTANCE = 2.4;
const MIN_CHAIN_LENGTH = 5;
const GRID_RESOLUTION = 110;
const GRADIENT_EPSILON = 0.35;
// A column only breaks where the swell travels toward the shallows.
const MIN_WAVE_FACING = 0.25;

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

// Depth at which the swell collapses: solves 0.72 * d = energy * shoal(d) by
// fixed-point iteration (shoal depends on d through the same rear-up curve
// the shaders use). Exported for tests and debug overlays.
export function computeBreakingDepth(settings, waveEnergy) {
  // Same energy-scaled shoal range as the water vertex shader.
  const range = Math.max(settings.shoalingDepth ?? 1.4, waveEnergy * 2.2, 1e-3);
  const shorelineWaves = settings.shorelineWaves ?? 0.35;
  let depth = Math.max((waveEnergy * 1.4) / 0.72, 0.12);
  for (let i = 0; i < 5; i += 1) {
    const deepFactor = THREE.MathUtils.smoothstep(depth, 0, range);
    const rearUp = (1 - THREE.MathUtils.smoothstep(depth, range * 0.45, range * 1.5)) *
      THREE.MathUtils.smoothstep(depth, 0.05, 0.35);
    const shoal = THREE.MathUtils.lerp(shorelineWaves, 1, deepFactor) * (1 + 0.3 * rearUp);
    // Big swells break far outside the shoaling band, so the ceiling must
    // scale with energy, not just the shoaling range.
    depth = Math.min(
      Math.max((waveEnergy * shoal) / 0.72, 0.12),
      Math.max(range * 2, waveEnergy * 2));
  }
  return depth;
}

// The overhanging shell is a second water surface. It works in a substantial
// shore/open-water column, but cannot be welded convincingly to the few-cm
// film used by an explicit calibration swash; there it produced detached
// foam ribbons. The main heightfield still performs depth capping and breaker
// foam, controlled by breakerEnabled/breakerAmount.
export function shouldUseDedicatedBreakerShell(settings, hasBedSampler = true) {
  return Boolean(
    hasBedSampler
      && settings?.breakerEnabled !== false
      && (settings?.breakerAmount ?? 0) > 0.001
      && (settings?.runupDistance ?? 0) <= 0.01,
  );
}

function pointKey(x, z) {
  return `${Math.round(x * 512)},${Math.round(z * 512)}`;
}

// Marching squares over the rest-depth field: returns raw contour segments
// [x0, z0, x1, z1] (world space) where restDepth crosses breakDepth.
function marchBreakContour({ bedSampler, originX, originZ, surfaceY, width, depth, breakDepth }) {
  const nx = GRID_RESOLUTION;
  const nz = GRID_RESOLUTION;
  const x0 = originX - width * 0.5;
  const z0 = originZ - depth * 0.5;
  const dx = width / nx;
  const dz = depth / nz;

  const field = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const x = x0 + i * dx;
      const z = z0 + j * dz;
      field[j * (nx + 1) + i] = (surfaceY - bedSampler(x, z)) - breakDepth;
    }
  }

  const segments = [];
  const lerpEdge = (xa, za, va, xb, zb, vb) => {
    const t = va / (va - vb);
    return [xa + (xb - xa) * t, za + (zb - za) * t];
  };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const v00 = field[j * (nx + 1) + i];
      const v10 = field[j * (nx + 1) + i + 1];
      const v11 = field[(j + 1) * (nx + 1) + i + 1];
      const v01 = field[(j + 1) * (nx + 1) + i];
      const caseIndex = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) |
        (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
      if (caseIndex === 0 || caseIndex === 15) continue;
      const xa = x0 + i * dx;
      const za = z0 + j * dz;
      const xb = xa + dx;
      const zb = za + dz;
      // Edge crossings: bottom (00-10), right (10-11), top (01-11), left (00-01).
      const bottom = (v00 > 0) !== (v10 > 0) ? lerpEdge(xa, za, v00, xb, za, v10) : null;
      const right = (v10 > 0) !== (v11 > 0) ? lerpEdge(xb, za, v10, xb, zb, v11) : null;
      const top = (v01 > 0) !== (v11 > 0) ? lerpEdge(xa, zb, v01, xb, zb, v11) : null;
      const left = (v00 > 0) !== (v01 > 0) ? lerpEdge(xa, za, v00, xa, zb, v01) : null;
      const crossings = [bottom, right, top, left].filter(Boolean);
      if (crossings.length === 2) {
        segments.push([...crossings[0], ...crossings[1]]);
      } else if (crossings.length === 4) {
        // Ambiguous saddle: pair bottom-right and top-left (arbitrary but
        // consistent; the wave-facing filter drops bad joins anyway).
        segments.push([...bottom, ...right], [...top, ...left]);
      }
    }
  }
  return segments;
}

// Joins raw segments into ordered polylines by matching endpoints.
function chainSegments(segments) {
  const adjacency = new Map();
  const addEnd = (key, entry) => {
    const list = adjacency.get(key);
    if (list) list.push(entry);
    else adjacency.set(key, [entry]);
  };
  segments.forEach((segment, index) => {
    addEnd(pointKey(segment[0], segment[1]), { index, end: 0 });
    addEnd(pointKey(segment[2], segment[3]), { index, end: 1 });
  });

  const used = new Array(segments.length).fill(false);
  const chains = [];
  const walk = (startIndex, startEnd) => {
    const chain = [];
    let index = startIndex;
    let end = startEnd;
    while (index !== -1 && !used[index]) {
      used[index] = true;
      const segment = segments[index];
      const from = end === 0
        ? [segment[0], segment[1]]
        : [segment[2], segment[3]];
      const to = end === 0
        ? [segment[2], segment[3]]
        : [segment[0], segment[1]];
      if (chain.length === 0) chain.push(from);
      chain.push(to);
      const nextList = adjacency.get(pointKey(to[0], to[1])) ?? [];
      const next = nextList.find((entry) => !used[entry.index]);
      if (!next) break;
      index = next.index;
      end = next.end;
    }
    return chain;
  };

  // Open chains first (endpoints with a single incident segment)...
  for (const entries of adjacency.values()) {
    if (entries.length !== 1 || used[entries[0].index]) continue;
    const chain = walk(entries[0].index, entries[0].end);
    if (chain.length > 1) chains.push(chain);
  }
  // ...then whatever remains (closed loops around islands).
  segments.forEach((_, index) => {
    if (used[index]) return;
    const chain = walk(index, 0);
    if (chain.length > 1) chains.push(chain);
  });
  return chains;
}

function smoothChain(points, iterations = 2) {
  let current = points;
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = current.map((point, i) => {
      if (i === 0 || i === current.length - 1) return point;
      return [
        (current[i - 1][0] + point[0] * 2 + current[i + 1][0]) * 0.25,
        (current[i - 1][1] + point[1] * 2 + current[i + 1][1]) * 0.25,
      ];
    });
    current = next;
  }
  return current;
}

function resampleChain(points, spacing) {
  const resampled = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i += 1) {
    let [px, pz] = points[i - 1];
    const [qx, qz] = points[i];
    let segmentLength = Math.hypot(qx - px, qz - pz);
    while (carried + segmentLength >= spacing) {
      const t = (spacing - carried) / segmentLength;
      px += (qx - px) * t;
      pz += (qz - pz) * t;
      resampled.push([px, pz]);
      segmentLength = Math.hypot(qx - px, qz - pz);
      carried = 0;
    }
    carried += segmentLength;
  }
  return resampled;
}

// Full break-line extraction: contour, smoothing, resampling, then per-point
// travel direction with the wave-facing split. Returns chains of
// { x, z, dirX, dirZ, depth } in world space.
export function extractBreakLineChains({
  bedSampler,
  originX,
  originZ,
  surfaceY,
  width,
  depth,
  breakDepth,
  waveDirX,
  waveDirZ,
}) {
  const segments = marchBreakContour({
    bedSampler, originX, originZ, surfaceY, width, depth, breakDepth,
  });
  const chains = [];
  for (const rawChain of chainSegments(segments)) {
    const resampled = resampleChain(smoothChain(rawChain), COLUMN_SPACING);
    if (resampled.length < 3) continue;

    // Travel direction: uphill bed gradient (toward the shallows), blended
    // with the global swell direction so noisy contours can't twist columns.
    const points = resampled.map(([x, z]) => {
      const gradientX = bedSampler(x + GRADIENT_EPSILON, z) - bedSampler(x - GRADIENT_EPSILON, z);
      const gradientZ = bedSampler(x, z + GRADIENT_EPSILON) - bedSampler(x, z - GRADIENT_EPSILON);
      const gradientLength = Math.hypot(gradientX, gradientZ) || 1;
      const shoreX = gradientX / gradientLength;
      const shoreZ = gradientZ / gradientLength;
      const facing = shoreX * waveDirX + shoreZ * waveDirZ;
      let dirX = shoreX * 0.6 + waveDirX * 0.4;
      let dirZ = shoreZ * 0.6 + waveDirZ * 0.4;
      const dirLength = Math.hypot(dirX, dirZ) || 1;
      dirX /= dirLength;
      dirZ /= dirLength;
      // Bed rise per meter of shoreward travel: lets the vertex shader
      // estimate the water depth under the crest as it rides through the
      // breaking zone (deeper offshore, shoaling out toward the beach).
      const slope = Math.max(
        (gradientX * dirX + gradientZ * dirZ) / (2 * GRADIENT_EPSILON), 0);
      return { x, z, dirX, dirZ, depth: surfaceY - bedSampler(x, z), facing, slope };
    });

    // Orient the chain so the peel travels the way the swell sweeps along
    // the shore — marching squares emits arbitrary winding, and a peel
    // running against the swell's alongshore drift reads backwards.
    let shoreX = 0;
    let shoreZ = 0;
    for (const point of points) {
      shoreX += point.dirX;
      shoreZ += point.dirZ;
    }
    const shoreLength = Math.hypot(shoreX, shoreZ) || 1;
    shoreX /= shoreLength;
    shoreZ /= shoreLength;
    const onshore = waveDirX * shoreX + waveDirZ * shoreZ;
    const alongX = waveDirX - onshore * shoreX;
    const alongZ = waveDirZ - onshore * shoreZ;
    const first = points[0];
    const last = points[points.length - 1];
    if ((last.x - first.x) * alongX + (last.z - first.z) * alongZ < 0) {
      points.reverse();
    }

    // Split into wave-facing runs and keep the ones long enough to surf.
    let run = [];
    const flushRun = () => {
      if ((run.length - 1) * COLUMN_SPACING >= MIN_CHAIN_LENGTH) chains.push(run);
      run = [];
    };
    for (const point of points) {
      if (point.facing > MIN_WAVE_FACING) run.push(point);
      else flushRun();
    }
    flushRun();
  }
  return chains;
}

// Stamps each chain point with its arc length and end fade. The geometry
// builder reads them into vertex attributes, and the CPU shell mirror
// (sampleAt) needs the same values for physics queries.
function annotateChains(chains) {
  for (const chain of chains) {
    let arc = 0;
    for (let i = 0; i < chain.length; i += 1) {
      if (i > 0) {
        arc += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z);
      }
      chain[i].along = arc;
    }
    for (const point of chain) {
      point.endFade = THREE.MathUtils.smoothstep(
        Math.min(point.along, arc - point.along), 0, END_FADE_DISTANCE);
    }
  }
  return chains;
}

// Ribbon geometry: PROFILE_ROWS rows per column, all rows anchored at the
// column's break-line point — the vertex shader spreads them into the shell.
function buildBreakerGeometry(chains, originX, originZ) {
  let vertexCount = 0;
  let quadCount = 0;
  for (const chain of chains) {
    vertexCount += chain.length * PROFILE_ROWS;
    quadCount += (chain.length - 1) * (PROFILE_ROWS - 1);
  }
  const positions = new Float32Array(vertexCount * 3);
  const dirs = new Float32Array(vertexCount * 2);
  const infos = new Float32Array(vertexCount * 4);
  const slopes = new Float32Array(vertexCount);
  const indices = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(quadCount * 6);

  let vertex = 0;
  let index = 0;
  for (const chain of chains) {
    const columnStart = vertex;
    for (let i = 0; i < chain.length; i += 1) {
      const point = chain[i];
      for (let row = 0; row < PROFILE_ROWS; row += 1) {
        positions[vertex * 3] = point.x - originX;
        positions[vertex * 3 + 1] = 0;
        positions[vertex * 3 + 2] = point.z - originZ;
        dirs[vertex * 2] = point.dirX;
        dirs[vertex * 2 + 1] = point.dirZ;
        infos[vertex * 4] = point.along;
        infos[vertex * 4 + 1] = row / (PROFILE_ROWS - 1);
        infos[vertex * 4 + 2] = point.depth;
        infos[vertex * 4 + 3] = point.endFade;
        slopes[vertex] = point.slope ?? 0;
        vertex += 1;
      }
    }
    for (let i = 0; i < chain.length - 1; i += 1) {
      for (let row = 0; row < PROFILE_ROWS - 1; row += 1) {
        const a = columnStart + i * PROFILE_ROWS + row;
        const b = a + PROFILE_ROWS;
        indices[index] = a;
        indices[index + 1] = b;
        indices[index + 2] = a + 1;
        indices[index + 3] = a + 1;
        indices[index + 4] = b;
        indices[index + 5] = b + 1;
        index += 6;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 2));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(infos, 4));
  geometry.setAttribute('aSlope', new THREE.BufferAttribute(slopes, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Shell displacement happens in the vertex shader; skip culling.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return geometry;
}

export class WaterBreakerSystem extends THREE.Group {
  constructor() {
    super();
    this.name = 'WaterBreakerSystem';
    markFactorySystemOwned(this, 'water', 'toonlab/water-breaker-system');
    this.chains = [];
    // Flattened chain points for CPU physics queries (sampleAt).
    this.columns = [];
    this.waves = null;
    this.params = null;
    this.time = 0;
    // attachWaveUniforms rebuilds this with the owning surface's uniform nodes
    // adopted into the graph (sharing after the fact cannot rewire a built
    // node graph; see water-breaker.js).
    this.material = createWaterBreakerNodeMaterial({
      waveCount: WATER_GERSTNER_WAVE_COUNT,
      foamOctaves: 3,
    });
    this.mesh = null;
  }

  // Shares the owning water material's Gerstner AND lighting uniforms by
  // reference, so the shell rides exactly the rendered swell and is shaded as
  // exactly the same material — colors, sun, fresnel, sparkles, and the live
  // planar reflection target all stay in lockstep with the surface.
  attachWaveUniforms(sourceMaterial) {
    if (!sourceMaterial?.uniforms?.uWavesA) return this;
    const waveCount = sourceMaterial.defines?.WATER_WAVE_COUNT;
    // Swapping `.uniforms` entries cannot rewire a built node graph, so
    // rebuild the material with the surface's uniform nodes adopted by
    // reference. Own uniform nodes are carried over so configure() writes
    // persist.
    this.material = createWaterBreakerNodeMaterial({
      waveCount: waveCount ?? this.material.defines.WATER_WAVE_COUNT,
      foamOctaves: this.material.defines.WATER_FOAM_OCTAVES ?? 3,
      previous: this.material.uniforms,
      shared: sourceMaterial.uniforms,
    });
    if (this.mesh) this.mesh.material = this.material;
    return this;
  }

  // Cheap per-frame uniform sync from the owning surface's settings. `waves`
  // is the CPU wave list matching uWavesA/B — sampleAt mirrors the shader
  // with it, so pass the live array (it is swapped on wave setting changes).
  configure(settings, waveEnergy, waves = this.waves) {
    this.waves = waves;
    this.params = {
      amount: THREE.MathUtils.clamp(settings.breakerAmount ?? 0, 0, 1),
      curl: settings.breakerCurl ?? 0.8,
      scale: settings.breakerScale ?? 1,
      peel: settings.breakerPeel ?? 1,
      setPair: (settings.waveSetStrength ?? 0) > 0.001,
    };
    const uniforms = this.material.uniforms;
    uniforms.uBreakerAmount.value = settings.breakerAmount ?? 0;
    uniforms.uBreakerCurl.value = settings.breakerCurl ?? 0.8;
    uniforms.uBreakerScale.value = settings.breakerScale ?? 1;
    uniforms.uBreakerPeel.value = settings.breakerPeel ?? 1;
    uniforms.uShoalingDepth.value = settings.shoalingDepth ?? 1.4;
    uniforms.uShorelineWaves.value = settings.shorelineWaves ?? 0.35;
    uniforms.uWaveEnergy.value = Math.max(waveEnergy ?? 0.3, 1e-3);
    uniforms.uSetPair.value = (settings.waveSetStrength ?? 0) > 0.001 ? 1 : 0;
    uniforms.uFoamNoiseScale.value = settings.foamNoiseScale ?? 0.6;
    setSrgbColor(uniforms.uShallowColor.value, settings.shallowColor);
    setSrgbColor(uniforms.uMidColor.value, settings.midColor);
    setSrgbColor(uniforms.uDeepColor.value, settings.deepColor);
    setSrgbColor(uniforms.uFoamColor.value, settings.foamColor);
    setSrgbColor(uniforms.uSunColor.value, settings.sunColor);
    uniforms.uSunDirection.value
      .set(settings.sunDirection[0], settings.sunDirection[1], settings.sunDirection[2])
      .normalize();
    return this;
  }

  // Re-extracts the break line and rebuilds the ribbon. Call when the water
  // level, surface position, or wave energy changes; the bed is assumed
  // static. Geometry positions are local to the owning surface.
  rebuild({ bedSampler, originX, originZ, surfaceY, width, depth, settings, waveEnergy, waves }) {
    let breakDepth = computeBreakingDepth(settings, waveEnergy);
    const dominant = waves?.[0] ?? { dirX: 1, dirZ: 0 };
    // A swell too big for the local bathymetry has its true break line out
    // past the deepest water here — walk the contour depth in until it
    // exists, so monster sets break at the deepest line the scene offers.
    this.chains = [];
    for (let attempt = 0; attempt < 6 && breakDepth > 0.12; attempt += 1) {
      this.chains = extractBreakLineChains({
        bedSampler,
        originX,
        originZ,
        surfaceY,
        width,
        depth,
        breakDepth,
        waveDirX: dominant.dirX,
        waveDirZ: dominant.dirZ,
      });
      if (this.chains.length > 0) break;
      breakDepth *= 0.72;
    }
    annotateChains(this.chains);
    this.columns = this.chains.flat();
    this.waves = waves ?? this.waves;
    const geometry = buildBreakerGeometry(this.chains, originX, originZ);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    } else {
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.mesh.frustumCulled = false;
      // Early in the transparent pass like the water surface (-0.5): just
      // above it so the sheet blends over the water, but before character
      // materials (0+). The material writes depth, so alpha-blended hair
      // drawn later still wins where it is closer — otherwise the shore foam
      // sheet paints over heads that overlap the waterline on screen.
      this.mesh.renderOrder = -0.4;
      this.add(this.mesh);
    }
    return this;
  }

  update(time) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    return this;
  }

  // CPU mirror of the vertex-shader shell so the breakers are PHYSICAL:
  // height queries ride the traveling wave face and flow queries return the
  // bore's shoreward push. Keep every constant in sync with
  // waterBreaker.vert.glsl. Writes into `result`:
  //   weight     0..1 blend of the shell over the base water surface
  //   crestY     shell crest height relative to the rest water level
  //   flowX/Z    horizontal push velocity (m/s, world space)
  // Only the wave envelope is mirrored (no overhanging lip): buoyancy needs
  // the single-valued surface the object actually rests on.
  sampleAt(x, z, result) {
    result.weight = 0;
    result.crestY = 0;
    result.flowX = 0;
    result.flowZ = 0;
    const waves = this.waves;
    const p = this.params;
    if (!waves?.length || !p || p.amount <= 0.001 || this.columns.length === 0) {
      return result;
    }
    const smoothstep = THREE.MathUtils.smoothstep;
    const w0 = waves[0];
    const w1 = waves[1] ?? w0;
    const k0 = Math.max(w0.waveNumber, 1e-4);
    const waveLen = (2 * Math.PI) / k0;
    const time = this.time;

    for (const col of this.columns) {
      const px = x - col.x;
      const pz = z - col.z;
      // Position along this column's travel line; skip columns whose line
      // does not pass near the query point (neighbors 0.8 m apart tile the
      // surf zone, so a ~1.2 m window always keeps the nearest few).
      const s = px * col.dirX + pz * col.dirZ;
      const latSq = px * px + pz * pz - s * s;
      if (latSq > 1.44) continue;

      const theta = k0 * (w0.dirX * col.x + w0.dirZ * col.z) - w0.omega * time +
        w0.phase - p.peel * 0.4 * k0 * col.along;
      const wrapped = (Math.PI * 0.5 - theta) / (2 * Math.PI) + 0.5;
      const delta = wrapped - Math.floor(wrapped) - 0.5;
      const facing = THREE.MathUtils.clamp(
        w0.dirX * col.dirX + w0.dirZ * col.dirZ, 0.3, 1);
      const ride = (delta * waveLen) / facing;
      const localDepth = THREE.MathUtils.clamp(
        col.depth - (col.slope ?? 0) * ride, 0.05, col.depth * 3);

      const crestX = col.x + col.dirX * ride;
      const crestZ = col.z + col.dirZ * ride;
      const thetaBeat = w1.waveNumber * (w1.dirX * crestX + w1.dirZ * crestZ) -
        w1.omega * time + w1.phase;
      const a0 = w0.amplitude;
      const a1 = w1.amplitude;
      const interference = Math.sqrt(Math.max(
        a0 * a0 + a1 * a1 + 2 * a0 * a1 * Math.cos(Math.PI * 0.5 - thetaBeat), 0)) /
        Math.max(a0 + a1, 1e-4);
      const setEnvelope = p.setPair ? interference : 1;
      const setGate = smoothstep(setEnvelope, 0.5, 0.78);
      if (setGate < 1e-3) continue;

      const approach = smoothstep(delta, -0.3, -0.03);
      const pulse = approach * (1 - smoothstep(delta, 0.03, 0.3)) * setGate;
      const post = smoothstep(delta, 0.02, 0.12) *
        (1 - smoothstep(delta, 0.28, 0.46)) * setGate;
      const travelFade = smoothstep(delta, -0.48, -0.4) *
        (1 - smoothstep(delta, 0.38, 0.47));

      const capDepth = Math.min(col.depth, localDepth);
      const breakHeight = 0.48 * capDepth * p.scale * p.amount * col.endFade * setEnvelope;
      const H = breakHeight * THREE.MathUtils.lerp(0.12, 1, pulse) * (1 - 0.55 * post);
      const fade = p.amount * col.endFade * travelFade * setGate *
        smoothstep(pulse + post, 0.12, 0.35) * smoothstep(H, 0.05, 0.15);
      if (fade < 0.02 || H < 0.03) continue;

      // Envelope profile along the travel axis, peaking at the leaned crest:
      // the long back face rises over ~2.1 H, the front drops over ~0.9 H.
      const lean = H * (0.3 * pulse + 0.45 * post);
      const u = s - ride - lean;
      const profile = u < 0
        ? smoothstep(u, -(2.1 * H + 0.35), 0)
        : 1 - smoothstep(u, 0, 0.9 * H + 0.2);
      const lateralFade = 1 - smoothstep(Math.sqrt(Math.max(latSq, 0)), 0.6, 1.2);
      const weight = profile * fade * lateralFade;
      if (weight <= result.weight) continue;

      result.weight = weight;
      result.crestY = H;
      // Broken whitewater carries near the crest phase speed; the unbroken
      // face mostly lifts, with a modest surface drift.
      const push = (w0.omega / k0 / facing) * (0.25 * pulse + 0.9 * post) * weight;
      result.flowX = col.dirX * push;
      result.flowZ = col.dirZ * push;
    }
    return result;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.material.dispose();
  }
}
