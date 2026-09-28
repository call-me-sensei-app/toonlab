// Persistent shoreline state update pass.
//
// Static bed texture (Float32 RGBA):
//   R = world-space bed height, G/B = dHeight/dX / dHeight/dZ,
//   A = valid-domain mask.
// Persistent state texture (RGBA16F):
//   R = moisture, G = fresh surface film/sheen,
//   B = active advected foam, A = stranded foam residue.
//
// This intentionally stays a small fullscreen fragment pass. The main water
// material only needs to sample the resulting texture once, avoiding more FBM
// stacks and private variables in the already-dense StylizedWater pipeline.

import * as THREE from 'three';
import {
  abs,
  clamp,
  cos,
  dot,
  exp,
  float,
  Fn,
  If,
  length,
  max,
  min,
  mix,
  positionGeometry,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

function hash01(value) {
  const n = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function periodicValueNoise(x, y, cells, seed) {
  const gridX = (x / 128) * cells;
  const gridY = (y / 128) * cells;
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const tx0 = gridX - x0;
  const ty0 = gridY - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const sample = (ix, iy) => {
    const wrappedX = ((ix % cells) + cells) % cells;
    const wrappedY = ((iy % cells) + cells) % cells;
    return hash01(wrappedX * 17.17 + wrappedY * 43.31 + seed);
  };
  const a = THREE.MathUtils.lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
  const b = THREE.MathUtils.lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
  return THREE.MathUtils.lerp(a, b, ty);
}

let shorelineNoiseTexture = null;
function getShorelineNoiseTexture() {
  if (shorelineNoiseTexture) return shorelineNoiseTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broadA = periodicValueNoise(x, y, 8, 3.17);
      const detailA = periodicValueNoise(x, y, 23, 11.93);
      const broadB = periodicValueNoise(x, y, 11, 29.41);
      const detailB = periodicValueNoise(x, y, 31, 47.77);
      data[index] = Math.round(THREE.MathUtils.clamp(broadA * 0.72 + detailA * 0.28, 0, 1) * 255);
      data[index + 1] = Math.round(THREE.MathUtils.clamp(broadB * 0.7 + detailB * 0.3, 0, 1) * 255);
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  }
  shorelineNoiseTexture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  shorelineNoiseTexture.name = 'waterShoreStateNoise';
  shorelineNoiseTexture.wrapS = THREE.RepeatWrapping;
  shorelineNoiseTexture.wrapT = THREE.RepeatWrapping;
  shorelineNoiseTexture.minFilter = THREE.LinearFilter;
  shorelineNoiseTexture.magFilter = THREE.LinearFilter;
  shorelineNoiseTexture.generateMipmaps = false;
  shorelineNoiseTexture.colorSpace = THREE.NoColorSpace;
  shorelineNoiseTexture.needsUpdate = true;
  return shorelineNoiseTexture;
}

let fallbackStateTexture = null;
function getFallbackStateTexture() {
  if (fallbackStateTexture) return fallbackStateTexture;
  fallbackStateTexture = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  fallbackStateTexture.name = 'waterShoreStateFallback';
  fallbackStateTexture.minFilter = THREE.NearestFilter;
  fallbackStateTexture.magFilter = THREE.NearestFilter;
  fallbackStateTexture.generateMipmaps = false;
  fallbackStateTexture.colorSpace = THREE.NoColorSpace;
  fallbackStateTexture.needsUpdate = true;
  return fallbackStateTexture;
}

let fallbackBedTexture = null;
function getFallbackBedTexture() {
  if (fallbackBedTexture) return fallbackBedTexture;
  fallbackBedTexture = new THREE.DataTexture(
    new Float32Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  fallbackBedTexture.name = 'waterShoreBedFallback';
  fallbackBedTexture.minFilter = THREE.NearestFilter;
  fallbackBedTexture.magFilter = THREE.NearestFilter;
  fallbackBedTexture.generateMipmaps = false;
  fallbackBedTexture.colorSpace = THREE.NoColorSpace;
  fallbackBedTexture.needsUpdate = true;
  return fallbackBedTexture;
}

let fallbackCurrentTexture = null;
function getFallbackCurrentTexture() {
  if (fallbackCurrentTexture) return fallbackCurrentTexture;
  // Zero signed velocity is encoded at the midpoint. B/A are zero so even a
  // filtered sample cannot contribute when no WaterCurrentField is attached.
  fallbackCurrentTexture = new THREE.DataTexture(
    new Uint8Array([128, 128, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  fallbackCurrentTexture.name = 'waterCurrentFieldFallback';
  fallbackCurrentTexture.minFilter = THREE.NearestFilter;
  fallbackCurrentTexture.magFilter = THREE.NearestFilter;
  fallbackCurrentTexture.generateMipmaps = false;
  fallbackCurrentTexture.colorSpace = THREE.NoColorSpace;
  fallbackCurrentTexture.needsUpdate = true;
  return fallbackCurrentTexture;
}

/**
 * Fullscreen update material for WaterShoreStateField.
 *
 * `uRegion = (centerX, centerZ, halfWidth, halfDepth)` in world metres.
 * Swash progress/distance are supplied by the CPU so this pass and the visible
 * water can share one event rather than reconstructing separate loop state.
 */
export function createWaterShoreStateSimulationNodeMaterial({
  resolutionX = 512,
  resolutionY = 128,
} = {}) {
  const u = {
    uPrevState: texture(getFallbackStateTexture()),
    uBedMap: texture(getFallbackBedTexture()),
    uNoiseMap: texture(getShorelineNoiseTexture()),
    uCurrentMap: texture(getFallbackCurrentTexture()),
    uTexel: uniform(new THREE.Vector2(1 / resolutionX, 1 / resolutionY)),
    uRegion: uniform(new THREE.Vector4(0, 0, 16, 8)),
    uCurrentRegion: uniform(new THREE.Vector4(0, 0, 1, 1)),
    uUseCurrentMap: uniform(0),
    uCurrentMaxSpeed: uniform(8),
    uCurrentStrength: uniform(1),
    uDelta: uniform(1 / 30),
    uTime: uniform(0),
    uWaterLevel: uniform(0),

    uSwashEnabled: uniform(0),
    uExplicitRunup: uniform(0),
    uSwashCycle: uniform(0),
    uSwashCycleSpeed: uniform(0),
    uSwashProgress: uniform(0),
    uSwashProgressSpeed: uniform(0),
    uSwashEdgeDistance: uniform(0),
    uSwashEdgeSpeed: uniform(0),
    uPrimaryDirection: uniform(new THREE.Vector2(1, 0)),
    uShorelineRunup: uniform(0.6),
    uWaveEnergy: uniform(0.3),
    uEventNoiseOffset: uniform(new THREE.Vector2()),
    uSwashEdgeShape: uniform(new THREE.Vector3(0, 0.1, 0)),

    uMoistureWetTime: uniform(0.12),
    uMoistureDryTime: uniform(120),
    uFilmWetTime: uniform(0.08),
    uFilmDryTime: uniform(2),
    uFoamWetLifetime: uniform(6),
    uFoamDryLifetime: uniform(2),
    uResidueLifetime: uniform(12),
    uFoamGain: uniform(7),
    uFoamAdvection: uniform(1),
    uFoamDiffusion: uniform(0.012),
    uFoamAmount: uniform(1),
    uNoiseScale: uniform(0.38),
    uBaseCurrent: uniform(new THREE.Vector2()),
  };

  const material = new NodeMaterial();
  material.name = 'WaterShoreStateSimulation';
  material.lights = false;
  material.fog = false;
  material.depthTest = false;
  material.depthWrite = false;
  material.vertexNode = Fn(() => vec4(positionGeometry.xy, 0.0, 1.0))();

  const vUv = uv();
  material.fragmentNode = Fn(() => {
    const result = vec4(0.0).toVar();
    const bed = u.uBedMap.sample(vUv).level(0).toVar();

    If(bed.a.greaterThan(0.5), () => {
      const worldSize = u.uRegion.zw.mul(2.0).toVar();
      const worldXZ = u.uRegion.xy.add(vUv.sub(0.5).mul(worldSize)).toVar();
      const bedGradient = bed.yz.toVar();
      const gradientLength = length(bedGradient).toVar();
      const bedSlope = max(gradientLength, 0.005).toVar();
      const shoreDirection = bedGradient.div(bedSlope).toVar();
      const alongDirection = vec2(shoreDirection.y, shoreDirection.x.negate()).toVar();
      const alongCoordinate = dot(worldXZ, alongDirection).toVar();
      const restDepth = u.uWaterLevel.sub(bed.r).toVar();

      // Exact connected-edge shape used by the current visible swash. The CPU
      // owns event progression; this pass only evaluates its spatial offset.
      const progress = clamp(u.uSwashProgress, 0.0, 1.0).toVar();
      const edgeEnvelope = mix(0.18, 1.0, sin(progress.mul(Math.PI))).toVar();
      const envelopeSpeed = cos(progress.mul(Math.PI))
        .mul(Math.PI * 0.82).mul(u.uSwashProgressSpeed).toVar();
      const incidenceSlope = clamp(u.uPrimaryDirection.x.mul(0.52), -0.2, 0.2).toVar();
      const rawEdgeTilt = alongCoordinate.mul(incidenceSlope).negate().toVar();
      const edgeTilt = rawEdgeTilt.div(abs(rawEdgeTilt).div(2.0).add(1.0)).toVar();

      const scallopA = alongCoordinate.mul(0.32).sub(u.uTime.mul(0.35)).toVar();
      const scallopB = alongCoordinate.mul(0.91).add(u.uTime.mul(0.18)).toVar();
      const edgeScallop = sin(scallopA)
        .sub(sin(u.uTime.mul(-0.35)))
        .add(sin(scallopB).sub(sin(u.uTime.mul(0.18))).mul(0.35))
        .mul(0.4)
        .toVar();
      const scallopSpeed = cos(scallopA).mul(-0.35)
        .add(cos(u.uTime.mul(-0.35)).mul(0.35))
        .add(
          cos(scallopB).mul(0.18)
            .sub(cos(u.uTime.mul(0.18)).mul(0.18))
            .mul(0.35),
        )
        .mul(0.4)
        .toVar();
      const macroAngle = u.uSwashCycle.mul(Math.PI).toVar();
      const macroWave = sin(macroAngle).toVar();
      const macroEnvelope = macroWave.mul(macroWave).toVar();
      const macroEnvelopeSpeed = macroWave.mul(cos(macroAngle))
        .mul(Math.PI * 2).mul(u.uSwashCycleSpeed).toVar();
      const secondaryPhase = u.uSwashEdgeShape.x.mul(-0.71).toVar();
      const macroBase = sin(
        alongCoordinate.mul(u.uSwashEdgeShape.y).add(u.uSwashEdgeShape.x),
      ).sub(sin(u.uSwashEdgeShape.x))
        .add(
          sin(
            alongCoordinate.mul(u.uSwashEdgeShape.y).mul(2.35).add(secondaryPhase),
          ).sub(sin(secondaryPhase)).mul(0.42),
        )
        .mul(u.uSwashEdgeShape.z)
        .toVar();
      const swashActivity = smoothstep(0.0, 0.05, u.uWaveEnergy).toVar();
      const edgeOffset = edgeTilt.add(edgeScallop).mul(edgeEnvelope)
        .add(macroBase.mul(macroEnvelope)).mul(swashActivity).toVar();
      const edgeOffsetSpeed = scallopSpeed.mul(edgeEnvelope)
        .add(edgeTilt.add(edgeScallop).mul(envelopeSpeed))
        .add(macroBase.mul(macroEnvelopeSpeed))
        .mul(swashActivity).toVar();

      // In automatic mode the horizontal distance contains 1/slope, so its
      // vertical head reduces to shorelineRunup * energy * progress.
      const automaticHead = u.uShorelineRunup.mul(u.uWaveEnergy).mul(progress).toVar();
      const explicitHead = u.uSwashEdgeDistance.mul(bedSlope).toVar();
      const baseHead = mix(automaticHead, explicitHead, u.uExplicitRunup).toVar();
      const edgeHead = baseHead.add(edgeOffset.mul(bedSlope))
        .mul(u.uSwashEnabled)
        .toVar();
      const filmHead = restDepth.add(edgeHead).toVar();
      const beachMask = smoothstep(0.06, 0.22, restDepth).oneMinus().toVar();
      const wetBehindEdge = smoothstep(-0.004, 0.012, filmHead).toVar();
      const instantWet = mix(1.0, wetBehindEdge, beachMask).toVar();
      const foamWidth = max(bedSlope.mul(0.68), 0.018).toVar();

      // Moisture and sheen belong to fixed ground coordinates, never to the
      // advected foam sample. Exponential response is update-rate independent.
      const stationaryState = u.uPrevState.sample(vUv).level(0).toVar();
      const moistureTau = select(
        instantWet.greaterThan(stationaryState.r),
        u.uMoistureWetTime,
        u.uMoistureDryTime,
      ).toVar();
      const moistureBlend = exp(
        u.uDelta.div(max(moistureTau, 1e-3)).negate(),
      ).oneMinus();
      const moisture = mix(stationaryState.r, instantWet, moistureBlend).toVar();

      const filmTau = select(
        instantWet.greaterThan(stationaryState.g),
        u.uFilmWetTime,
        u.uFilmDryTime,
      ).toVar();
      const filmBlend = exp(u.uDelta.div(max(filmTau, 1e-3)).negate()).oneMinus();
      const surfaceFilm = mix(stationaryState.g, instantWet, filmBlend).toVar();

      // Analytic shore-normal flow follows the same changing edge, including
      // the local scallop velocity. Optional baseCurrent is a future river /
      // channel hook and is deliberately independent of visual UV scrolling.
      const automaticHeadSpeed = u.uShorelineRunup.mul(u.uWaveEnergy)
        .mul(u.uSwashProgressSpeed).toVar();
      const explicitHeadSpeed = u.uSwashEdgeSpeed.mul(bedSlope).toVar();
      const baseHeadSpeed = mix(
        automaticHeadSpeed,
        explicitHeadSpeed,
        u.uExplicitRunup,
      ).toVar();
      const normalSpeed = baseHeadSpeed.add(edgeOffsetSpeed.mul(bedSlope))
        .div(bedSlope)
        .mul(u.uSwashEnabled)
        .toVar();
      const clampedNormalSpeed = clamp(normalSpeed, -3.5, 3.5).toVar();
      // Oblique breakers generate a modest longshore current. Carrying rafts
      // sideways prevents successive cycles from stacking foam at identical
      // X positions while remaining tied to real incidence, not random drift.
      const alongshoreSpeed = dot(u.uPrimaryDirection, alongDirection)
        .mul(abs(clampedNormalSpeed)).mul(0.35).toVar();
      // Optional authored world-space flow map. The RGBA8 encoding is shared
      // with WaterCurrentField: signed velocity in RG, fluid weight in B,
      // valid-domain weight in A. It is sampled only in this small transport
      // pass; the main visible-water shader remains unchanged.
      const currentWorldSize = max(u.uCurrentRegion.zw.mul(2.0), vec2(1e-3)).toVar();
      const currentUv = worldXZ.sub(u.uCurrentRegion.xy)
        .div(currentWorldSize).add(0.5).toVar();
      const currentInside = currentUv.x.greaterThanEqual(0.0)
        .and(currentUv.x.lessThanEqual(1.0))
        .and(currentUv.y.greaterThanEqual(0.0))
        .and(currentUv.y.lessThanEqual(1.0));
      const currentInsideMask = select(currentInside, float(1.0), float(0.0)).toVar();
      const encodedCurrent = u.uCurrentMap.sample(clamp(currentUv, 0.0, 1.0))
        .level(0).toVar();
      // WaterCurrentField reserves byte 128 as exact zero. Decode in byte
      // space instead of using `rg * 2 - 1`, whose UNORM midpoint would add
      // a small but persistent preferred drift to still-water foam.
      const spatialCurrent = encodedCurrent.rg.mul(255.0).sub(128.0).div(127.0)
        .mul(u.uCurrentMaxSpeed)
        .mul(encodedCurrent.b.mul(encodedCurrent.a))
        .mul(currentInsideMask)
        .mul(u.uUseCurrentMap)
        .mul(u.uCurrentStrength)
        .toVar();
      const velocity = shoreDirection.mul(clampedNormalSpeed)
        .add(alongDirection.mul(alongshoreSpeed))
        .mul(beachMask).mul(instantWet)
        .add(u.uBaseCurrent.mul(instantWet))
        .add(spatialCurrent.mul(instantWet))
        .mul(u.uFoamAdvection)
        .toVar();
      const backUv = vUv.sub(velocity.mul(u.uDelta).div(max(worldSize, vec2(1e-3))))
        .toVar();
      const backInside = backUv.x.greaterThanEqual(0.0).and(backUv.x.lessThanEqual(1.0))
        .and(backUv.y.greaterThanEqual(0.0)).and(backUv.y.lessThanEqual(1.0));
      const backMask = select(backInside, float(1.0), float(0.0)).toVar();
      const halfTexel = u.uTexel.mul(0.5).toVar();
      const clampedBackUv = clamp(backUv, halfTexel, halfTexel.oneMinus()).toVar();
      const advectedState = u.uPrevState.sample(clampedBackUv).level(0).toVar();
      const advectedFoam = advectedState.b.mul(backMask).toVar();

      // Small physical-space diffusion disperses rafts without tying the
      // result to atlas resolution. The coefficient is capped to the explicit
      // diffusion stability limit even if callers supply an extreme value.
      const leftFoam = u.uPrevState.sample(
        clamp(clampedBackUv.sub(vec2(u.uTexel.x, 0.0)), halfTexel, halfTexel.oneMinus()),
      ).level(0).b.mul(backMask);
      const rightFoam = u.uPrevState.sample(
        clamp(clampedBackUv.add(vec2(u.uTexel.x, 0.0)), halfTexel, halfTexel.oneMinus()),
      ).level(0).b.mul(backMask);
      const downFoam = u.uPrevState.sample(
        clamp(clampedBackUv.sub(vec2(0.0, u.uTexel.y)), halfTexel, halfTexel.oneMinus()),
      ).level(0).b.mul(backMask);
      const upFoam = u.uPrevState.sample(
        clamp(clampedBackUv.add(vec2(0.0, u.uTexel.y)), halfTexel, halfTexel.oneMinus()),
      ).level(0).b.mul(backMask);
      const texelWorld = worldSize.mul(u.uTexel).toVar();
      const invDx2 = float(1.0).div(max(texelWorld.x.mul(texelWorld.x), 1e-6)).toVar();
      const invDz2 = float(1.0).div(max(texelWorld.y.mul(texelWorld.y), 1e-6)).toVar();
      const laplacian = leftFoam.add(rightFoam).sub(advectedFoam.mul(2.0)).mul(invDx2)
        .add(downFoam.add(upFoam).sub(advectedFoam.mul(2.0)).mul(invDz2))
        .toVar();
      const diffusionDt = min(
        u.uFoamDiffusion.mul(u.uDelta),
        float(0.24).div(max(invDx2.add(invDz2), 1e-6)),
      ).toVar();
      const dispersedFoam = clamp(advectedFoam.add(laplacian.mul(diffusionDt)), 0.0, 1.0)
        .toVar();

      // A deterministic, world-anchored source with a per-event offset. There
      // is intentionally no nonzero coverage floor: the front is broken into
      // patches at injection, while temporal state supplies continuity.
      const noiseSample = u.uNoiseMap.sample(
        worldXZ.mul(u.uNoiseScale).add(u.uEventNoiseOffset),
      ).level(0).rg.toVar();
      const fineNoise = u.uNoiseMap.sample(
        // A second independent but still resolvable scale supplies holes
        // inside the broad rafts. The former 2.37 multiplier approached the
        // state atlas footprint and read as regular cut-out scallops.
        worldXZ.mul(u.uNoiseScale.mul(1.65))
          .add(u.uEventNoiseOffset.mul(1.71)).add(vec2(0.31, 0.67)),
      ).level(0).rg.toVar();
      // The signed film head is also what clips the visible water. Keep the
      // source centered on that physical silhouette and let noise decide
      // whether a raft exists along it. The old +/-0.7*foamWidth cross-shore
      // displacement could move a patch ~48 cm inside a 1:20 beach, leaving
      // a clear strip between sand and white and making foam read as a
      // reflection floating in the sheet.
      const edgeJitter = noiseSample.r.sub(0.5)
        .mul(min(foamWidth.mul(0.22), 0.004)).toVar();
      const sourceHead = filmHead.add(edgeJitter).toVar();
      // Randomize the distance each attached raft reaches into the water,
      // rather than giving every surviving patch the same band width. On the
      // lab's 1:20 beach this spans roughly 0.35-1.7 m and recreates the
      // believable tongues/holes of the earlier foam without detaching them
      // from the silhouette.
      const raftReach = foamWidth
        .mul(mix(0.5, 1.9, noiseSample.g))
        .mul(mix(0.8, 1.25, fineNoise.r))
        .toVar();
      const frontBand = smoothstep(-0.01, -0.001, sourceHead)
        .mul(smoothstep(raftReach.mul(0.55), raftReach, sourceHead).oneMinus())
        .toVar();
      const trailBand = smoothstep(raftReach.mul(0.42), raftReach.mul(0.82), sourceHead)
        .mul(smoothstep(raftReach.mul(1.55), raftReach.mul(2.8), sourceHead).oneMinus())
        .toVar();
      const speed = clamp(abs(clampedNormalSpeed).div(3.5), 0.0, 1.0).toVar();
      const backwash = clamp(clampedNormalSpeed.negate().div(3.5), 0.0, 1.0).toVar();
      const frontSource = frontBand
        .mul(smoothstep(0.35, 0.58, noiseSample.r))
        .mul(smoothstep(0.3, 0.55, fineNoise.g))
        // The moving front injects strongly, but near maximum run-up its
        // speed approaches zero. A large stationary floor used to pile foam
        // into the same crest-shaped stripe for several frames; temporal
        // retention already carries the moving rafts through that pause.
        .mul(mix(0.32, 1.0, speed));
      const trailSource = trailBand
        .mul(smoothstep(0.55, 0.72, noiseSample.g))
        .mul(smoothstep(0.38, 0.6, fineNoise.r))
        .mul(backwash)
        .mul(0.18);
      const source = max(frontSource, trailSource)
        .mul(beachMask)
        .mul(u.uSwashEnabled)
        .mul(clamp(u.uFoamAmount, 0.0, 2.0))
        .toVar();

      const foamLifetime = mix(u.uFoamDryLifetime, u.uFoamWetLifetime, instantWet).toVar();
      const retainedFoam = dispersedFoam.mul(
        exp(u.uDelta.div(max(foamLifetime, 1e-3)).negate()),
      ).toVar();
      const injectedFoam = source.mul(
        exp(u.uFoamGain.mul(u.uDelta).negate()).oneMinus(),
      ).toVar();
      // Latch only the already-gated current lip into the visible range. A
      // fast 6-7 m/s uprush can move several state texels during the 2-5
      // frames needed for ordinary temporal accumulation, which left the
      // bright raft visibly behind the water silhouette. Because frontSource
      // has two true zero-floor gates, this adds immediate attached patches
      // without drawing a continuous fallback line.
      const attachedLip = frontSource.mul(0.72).toVar();
      const activeFoam = clamp(
        max(
          retainedFoam.add(injectedFoam.mul(retainedFoam.oneMinus())),
          attachedLip,
        ),
        0.0,
        1.0,
      ).toVar();

      // Residue follows foam while covered, then sticks to exposed sand. It
      // fades slowly and washes out gently on the next inundation.
      const advectedResidue = advectedState.a.mul(backMask).toVar();
      const residueBase = mix(stationaryState.a, advectedResidue, instantWet).toVar();
      const residueRetained = residueBase
        .mul(exp(u.uDelta.div(max(u.uResidueLifetime, 1e-3)).negate()))
        .mul(exp(instantWet.mul(u.uDelta).mul(-0.18)))
        .toVar();
      const residueDeposit = activeFoam.mul(beachMask).mul(instantWet.oneMinus())
        .mul(exp(u.uDelta.mul(-2.5)).oneMinus())
        .add(
          trailSource.mul(backwash)
            .mul(exp(u.uDelta.mul(-0.8)).oneMinus()),
        )
        .toVar();
      const residue = clamp(
        residueRetained.add(residueDeposit.mul(residueRetained.oneMinus())),
        0.0,
        1.0,
      ).toVar();

      result.assign(vec4(moisture, surfaceFilm, activeFoam, residue));
    });

    return result;
  })();

  material.uniforms = u;
  material.userData.isWaterShoreStateSimulation = true;
  return material;
}
