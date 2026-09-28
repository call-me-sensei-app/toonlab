// LUT-assisted atmosphere scattering. Both LUTs use U=(mu+1)/2 and
// V=altitude/100 km. Transmittance uses 40 midpoint samples; multiple scattering
// uses 64 Fibonacci directions x 20 steps; view integration uses 12
// quadratic-biased steps.

import * as THREE from 'three';
import {
  clamp,
  dot,
  exp,
  float,
  length,
  Loop,
  max,
  min,
  normalize,
  pow,
  sqrt,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';

export const ATMOSPHERE_MEDIUM = Object.freeze({
  bottomRadius: 6371,
  topRadius: 6471,
  rayleighScaleHeight: 8,
  mieScaleHeight: 1.2,
  rayleighScattering: Object.freeze([5.802e-3, 13.558e-3, 33.1e-3]),
  mieScattering: 21e-3,
  mieExtinction: 21e-3 * 1.1,
  ozoneAbsorption: Object.freeze([0, 0, 0]),
  ozoneCenterAltitude: 25,
  ozoneHalfWidth: 15,
});

const EARTH_R = ATMOSPHERE_MEDIUM.bottomRadius;
const ATMO_R = ATMOSPHERE_MEDIUM.topRadius;
const THICKNESS = ATMO_R - EARTH_R;
const HR = ATMOSPHERE_MEDIUM.rayleighScaleHeight;
const HM = ATMOSPHERE_MEDIUM.mieScaleHeight;
const BETA_R = ATMOSPHERE_MEDIUM.rayleighScattering;
const BETA_M_BASE = ATMOSPHERE_MEDIUM.mieScattering;
const MIE_EXTINCTION_FACTOR = 1.1;
const UNIFORM_PHASE = 1 / (4 * Math.PI);
const GOLDEN_ANGLE = 2.399963229728653;

export const TRANSMITTANCE_LUT_WIDTH = 256;
export const TRANSMITTANCE_LUT_HEIGHT = 64;
export const MULTI_SCATTERING_LUT_SIZE = 32;

const TRANSMITTANCE_STEPS = 40;
const MULTI_SCATTERING_DIRECTIONS = 64;
const MULTI_SCATTERING_STEPS = 20;
const VIEW_MARCH_STEPS = 12;

/** Converts turbidity to the aerosol-density multiplier. */
export function aerosolScaleForTurbidity(turbidity) {
  return Math.max(Number(turbidity) || 0, 0);
}

/** Approximate meteorological range for diagnostics only. */
export function visibilityForTurbidity(turbidity) {
  const extinction = BETA_R[1] + BETA_M_BASE * MIE_EXTINCTION_FACTOR
    * aerosolScaleForTurbidity(turbidity);
  return 3.912 / Math.max(extinction, 1e-8);
}

function betaFor(params) {
  const rayleigh = Math.max(Number(params.rayleigh.value) || 0, 0);
  const turbidity = Math.max(Number(params.turbidity.value) || 0, 0);
  return {
    betaR: BETA_R.map((value) => value * rayleigh),
    betaM: BETA_M_BASE * turbidity,
    betaMExt: BETA_M_BASE * turbidity * MIE_EXTINCTION_FACTOR,
  };
}

function distanceToAtmosphere(positionY, directionY) {
  const b = 2 * positionY * directionY;
  const c = positionY * positionY - ATMO_R * ATMO_R;
  return Math.max((-b + Math.sqrt(Math.max(b * b - 4 * c, 0))) * 0.5, 0);
}

function distanceToGroundAtPoint(px, py, pz, dx, dy, dz) {
  const b = 2 * (px * dx + py * dy + pz * dz);
  const c = px * px + py * py + pz * pz - EARTH_R * EARTH_R;
  const disc = b * b - 4 * c;
  if (disc <= 0) return -1;
  const distance = (-b - Math.sqrt(Math.max(disc, 0))) * 0.5;
  return distance > 0 ? distance : -1;
}

function createLutTexture(name, width, height) {
  const map = new THREE.DataTexture(
    new Uint16Array(width * height * 4),
    width,
    height,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  map.name = name;
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.needsUpdate = true;
  return map;
}

// GPU targets are rgba16float. Quantise the CPU copy too, because the
// multiple-scattering pass reads the already-quantised transmittance target.
function uploadHalfFloat(source, map) {
  const target = map.image.data;
  for (let index = 0; index < source.length; index += 1) {
    const half = THREE.DataUtils.toHalfFloat(source[index]);
    target[index] = half;
    source[index] = THREE.DataUtils.fromHalfFloat(half);
  }
  map.needsUpdate = true;
}

/** Bilinear clamp-to-edge fetch matching the LUT texture sampler. */
function fetchBilinear(data, width, height, u, v, out) {
  const x = Math.min(Math.max(u, 0), 1) * width - 0.5;
  const y = Math.min(Math.max(v, 0), 1) * height - 0.5;
  const x0 = Math.min(Math.max(Math.floor(x), 0), width - 1);
  const y0 = Math.min(Math.max(Math.floor(y), 0), height - 1);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = Math.min(Math.max(x - x0, 0), 1);
  const fy = Math.min(Math.max(y - y0, 0), 1);
  const o00 = (y0 * width + x0) * 4;
  const o10 = (y0 * width + x1) * 4;
  const o01 = (y1 * width + x0) * 4;
  const o11 = (y1 * width + x1) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    const a = data[o00 + channel] * (1 - fx) + data[o10 + channel] * fx;
    const b = data[o01 + channel] * (1 - fx) + data[o11 + channel] * fx;
    out[channel] = a * (1 - fy) + b * fy;
  }
  return out;
}

function fetchLut(data, width, height, altitude, mu, out) {
  return fetchBilinear(
    data,
    width,
    height,
    mu * 0.5 + 0.5,
    altitude / THICKNESS,
    out,
  );
}

function bakeTransmittance(coeffs, out) {
  for (let y = 0; y < TRANSMITTANCE_LUT_HEIGHT; y += 1) {
    const altitude = ((y + 0.5) / TRANSMITTANCE_LUT_HEIGHT) * THICKNESS;
    const radius = EARTH_R + altitude;
    for (let x = 0; x < TRANSMITTANCE_LUT_WIDTH; x += 1) {
      const mu = ((x + 0.5) / TRANSMITTANCE_LUT_WIDTH) * 2 - 1;
      const dx = Math.sqrt(Math.max(1 - mu * mu, 0));
      const distance = distanceToAtmosphere(radius, mu);
      const dt = distance / TRANSMITTANCE_STEPS;
      let opticalR = 0;
      let opticalM = 0;
      for (let stepIndex = 0; stepIndex < TRANSMITTANCE_STEPS; stepIndex += 1) {
        const t = (stepIndex + 0.5) * dt;
        const px = dx * t;
        const py = radius + mu * t;
        const height = Math.max(Math.sqrt(px * px + py * py) - EARTH_R, 0);
        opticalR += Math.exp(-height / HR) * dt;
        opticalM += Math.exp(-height / HM) * dt;
      }
      const blocked = distanceToGroundAtPoint(0, radius, 0, dx, mu, 0) > 0;
      const offset = (y * TRANSMITTANCE_LUT_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        out[offset + channel] = blocked
          ? 0
          : Math.exp(-(coeffs.betaR[channel] * opticalR + coeffs.betaMExt * opticalM));
      }
      out[offset + 3] = 1;
    }
  }
}

function bakeMultiScattering(coeffs, groundAlbedo, transmittance, out, directions, steps) {
  const sunT = [0, 0, 0];
  for (let y = 0; y < MULTI_SCATTERING_LUT_SIZE; y += 1) {
    const altitude = ((y + 0.5) / MULTI_SCATTERING_LUT_SIZE) * THICKNESS;
    const radius = EARTH_R + altitude;
    for (let x = 0; x < MULTI_SCATTERING_LUT_SIZE; x += 1) {
      const muSun = ((x + 0.5) / MULTI_SCATTERING_LUT_SIZE) * 2 - 1;
      const sunX = Math.sqrt(Math.max(1 - muSun * muSun, 0));
      const l2 = [0, 0, 0];
      const transfer = [0, 0, 0];

      for (let directionIndex = 0; directionIndex < directions; directionIndex += 1) {
        const dy = 1 - (2 * (directionIndex + 0.5)) / directions;
        const phi = directionIndex * GOLDEN_ANGLE;
        const ring = Math.sqrt(Math.max(1 - dy * dy, 0));
        const dx = ring * Math.cos(phi);
        const dz = ring * Math.sin(phi);
        const tAtmo = distanceToAtmosphere(radius, dy);
        const tGround = distanceToGroundAtPoint(0, radius, 0, dx, dy, dz);
        const groundHit = tGround > 0;
        const tEnd = groundHit ? Math.min(tGround, tAtmo) : tAtmo;
        const dt = tEnd / steps;
        const throughput = [1, 1, 1];
        const pathL2 = [0, 0, 0];
        const pathTransfer = [0, 0, 0];

        for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
          const t = (stepIndex + 0.5) * dt;
          const px = dx * t;
          const py = radius + dy * t;
          const pz = dz * t;
          const pLength = Math.sqrt(px * px + py * py + pz * pz);
          const height = Math.max(pLength - EARTH_R, 0);
          const densityR = Math.exp(-height / HR);
          const densityM = Math.exp(-height / HM);
          const localMuSun = (px * sunX + py * muSun) / pLength;
          fetchLut(
            transmittance,
            TRANSMITTANCE_LUT_WIDTH,
            TRANSMITTANCE_LUT_HEIGHT,
            height,
            localMuSun,
            sunT,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            const sigmaS = coeffs.betaR[channel] * densityR + coeffs.betaM * densityM;
            const sigmaT = coeffs.betaR[channel] * densityR + coeffs.betaMExt * densityM;
            pathL2[channel] += throughput[channel] * sigmaS * sunT[channel]
              * UNIFORM_PHASE * dt;
            pathTransfer[channel] += throughput[channel] * sigmaS * dt;
            throughput[channel] *= Math.exp(-sigmaT * dt);
          }
        }

        if (groundHit) {
          const px = dx * tEnd;
          const py = radius + dy * tEnd;
          const pz = dz * tEnd;
          const pLength = Math.sqrt(px * px + py * py + pz * pz);
          const nDotL = Math.max((px * sunX + py * muSun) / pLength, 0);
          fetchLut(
            transmittance,
            TRANSMITTANCE_LUT_WIDTH,
            TRANSMITTANCE_LUT_HEIGHT,
            0,
            nDotL,
            sunT,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            pathL2[channel] += throughput[channel] * groundAlbedo[channel]
              * nDotL * sunT[channel] / Math.PI;
          }
        }

        for (let channel = 0; channel < 3; channel += 1) {
          l2[channel] += pathL2[channel];
          transfer[channel] += pathTransfer[channel];
        }
      }

      const offset = (y * MULTI_SCATTERING_LUT_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const secondOrder = l2[channel] / directions;
        const fms = Math.min(transfer[channel] / directions, 0.999);
        out[offset + channel] = secondOrder / (1 - fms);
      }
      out[offset + 3] = 1;
    }
  }
}

function lutCoordNode(altitude, mu) {
  return vec2(mu.mul(0.5).add(0.5), altitude.div(THICKNESS));
}

/** Rayleigh phase, 3/(16 pi) (1 + cos^2). */
export function rayleighPhaseNode(cosTheta) {
  return cosTheta.mul(cosTheta).add(1).mul(3 / (16 * Math.PI));
}

/** Standard Henyey-Greenstein phase used by the cloud marcher. */
export function henyeyGreensteinPhaseNode(cosTheta, g) {
  const g2 = g.mul(g);
  const denom = g2.add(1).sub(cosTheta.mul(g).mul(2));
  return g2.oneMinus().div(pow(max(denom, 1e-4), 1.5).mul(4 * Math.PI));
}

/** Cornette-Shanks phase used for atmospheric Mie scattering. */
function mieAtmospherePhaseNode(cosTheta, g) {
  const cos2 = cosTheta.mul(cosTheta);
  const g2 = g.mul(g);
  const base = max(float(1).add(g2).sub(g.mul(cosTheta).mul(2)), 0.001);
  return float(3).mul(g2.oneMinus())
    .div(float(8 * Math.PI).mul(float(2).add(g2)))
    .mul(cos2.add(1))
    .div(base.mul(sqrt(base)));
}

function mieAtmospherePhaseCpu(cosTheta, gValue) {
  const g = Math.min(Math.max(gValue, 0), 0.999);
  const g2 = g * g;
  const base = Math.max(1 + g2 - 2 * g * cosTheta, 0.001);
  return (3 * (1 - g2) * (1 + cosTheta * cosTheta))
    / (8 * Math.PI * (2 + g2) * base * Math.sqrt(base));
}

export function createAtmosphereScattering({
  params,
  name = 'Atmosphere',
  multiScatteringDirections = MULTI_SCATTERING_DIRECTIONS,
  multiScatteringSteps = MULTI_SCATTERING_STEPS,
} = {}) {
  if (!params?.rayleigh || !params?.groundAlbedo) {
    throw new TypeError('createAtmosphereScattering needs an atmosphere param group.');
  }

  const transmittanceData = new Float32Array(
    TRANSMITTANCE_LUT_WIDTH * TRANSMITTANCE_LUT_HEIGHT * 4,
  );
  const multiScatteringData = new Float32Array(
    MULTI_SCATTERING_LUT_SIZE * MULTI_SCATTERING_LUT_SIZE * 4,
  );
  const transmittanceTexture = createLutTexture(
    `${name}TransmittanceLut`,
    TRANSMITTANCE_LUT_WIDTH,
    TRANSMITTANCE_LUT_HEIGHT,
  );
  const multiScatteringTexture = createLutTexture(
    `${name}MultiScatteringLut`,
    MULTI_SCATTERING_LUT_SIZE,
    MULTI_SCATTERING_LUT_SIZE,
  );
  const medium = {
    rayleighScattering: uniform(new THREE.Vector3()),
    mieScattering: uniform(0),
    mieExtinction: uniform(0),
    ozoneAbsorption: uniform(new THREE.Vector3()),
  };
  const transmittanceMap = texture(transmittanceTexture);
  const multiScatteringMap = texture(multiScatteringTexture);
  let coeffs = null;
  let bakedRevision = -1;

  function transmittanceAt(altitude, mu, out = [0, 0, 0]) {
    return fetchLut(
      transmittanceData,
      TRANSMITTANCE_LUT_WIDTH,
      TRANSMITTANCE_LUT_HEIGHT,
      altitude,
      mu,
      out,
    );
  }

  function multiScatteringAt(altitude, mu, out = [0, 0, 0]) {
    return fetchLut(
      multiScatteringData,
      MULTI_SCATTERING_LUT_SIZE,
      MULTI_SCATTERING_LUT_SIZE,
      altitude,
      mu,
      out,
    );
  }

  function bake() {
    coeffs = betaFor(params);
    bakeTransmittance(coeffs, transmittanceData);
    uploadHalfFloat(transmittanceData, transmittanceTexture);
    const albedo = params.groundAlbedo.value;
    bakeMultiScattering(
      coeffs,
      [albedo.r, albedo.g, albedo.b],
      transmittanceData,
      multiScatteringData,
      multiScatteringDirections,
      multiScatteringSteps,
    );
    uploadHalfFloat(multiScatteringData, multiScatteringTexture);
    medium.rayleighScattering.value.set(...coeffs.betaR);
    medium.mieScattering.value = coeffs.betaM;
    medium.mieExtinction.value = coeffs.betaMExt;
    bakedRevision = params.bakeRevision;
    return bakedRevision;
  }

  function bakeIfNeeded() {
    if (bakedRevision !== params.bakeRevision) bake();
    return bakedRevision;
  }

  bake();

  return {
    medium,
    transmittanceTexture,
    multiScatteringTexture,
    transmittanceData,
    multiScatteringData,
    bake,
    bakeIfNeeded,
    get bakedRevision() { return bakedRevision; },
    get coefficients() {
      const albedo = params.groundAlbedo.value;
      return {
        aerosolScale: params.turbidity.value,
        rayleighScattering: [...coeffs.betaR],
        mieScattering: coeffs.betaM,
        mieExtinction: coeffs.betaMExt,
        ozoneAbsorption: [0, 0, 0],
        groundAlbedo: [albedo.r, albedo.g, albedo.b],
      };
    },
    transmittanceNode(altitude, mu) {
      return transmittanceMap.sample(lutCoordNode(altitude, mu)).rgb;
    },
    multiScatteringNode(altitude, mu) {
      return multiScatteringMap.sample(lutCoordNode(altitude, mu)).rgb;
    },
    mediumNodes(altitude) {
      const densityR = exp(altitude.div(-HR));
      const densityM = exp(altitude.div(-HM));
      const rayleighScattering = medium.rayleighScattering.mul(densityR).toVar();
      const mieScattering = medium.mieScattering.mul(densityM).toVar();
      const extinction = rayleighScattering.add(medium.mieExtinction.mul(densityM)).toVar();
      return { rayleighScattering, mieScattering, extinction };
    },
    transmittanceAt,
    multiScatteringAt,
    radianceAt({
      viewDir = [0, 1, 0],
      sunDir = [0, 1, 0],
      sunIrradiance = [1, 1, 1],
      steps = VIEW_MARCH_STEPS,
      mieDirectionalG = params.mieDirectionalG.value,
      mieScatteringStrength = params.mieScatteringStrength.value,
      skyMultipleScattering = params.skyMultipleScattering.value,
      maxDistanceKm = null,
      densityScale = null,
    } = {}) {
      const viewLength = Math.hypot(viewDir[0], Math.max(viewDir[1], 0.001), viewDir[2]) || 1;
      const vx = viewDir[0] / viewLength;
      const vy = Math.max(viewDir[1], 0.001) / viewLength;
      const vz = viewDir[2] / viewLength;
      const sunLength = Math.hypot(...sunDir) || 1;
      const sx = sunDir[0] / sunLength;
      const sy = sunDir[1] / sunLength;
      const sz = sunDir[2] / sunLength;
      const originY = EARTH_R + 0.0001;
      let tMax = distanceToAtmosphere(originY, vy);
      if (maxDistanceKm !== null) tMax = Math.min(tMax, maxDistanceKm);
      const accumR = [0, 0, 0];
      const accumM = [0, 0, 0];
      const accumMS = [0, 0, 0];
      const sunT = [0, 0, 0];
      const ms = [0, 0, 0];
      let opticalR = 0;
      let opticalM = 0;
      const dtCoefficient = 2 * tMax / steps;
      for (let index = 0; index < steps; index += 1) {
        const u = (index + 0.5) / steps;
        const t = u * u * tMax;
        const dt = u * dtCoefficient;
        const px = vx * t;
        const py = originY + vy * t;
        const pz = vz * t;
        const pLength = Math.hypot(px, py, pz);
        const altitude = Math.max(pLength - EARTH_R, 0);
        const scale = densityScale === null ? 1 : densityScale;
        const densityR = Math.exp(-altitude / HR) * scale;
        const densityM = Math.exp(-altitude / HM) * scale;
        opticalR += densityR * dt;
        opticalM += densityM * dt;
        const mu = (px * sx + py * sy + pz * sz) / pLength;
        transmittanceAt(altitude, mu, sunT);
        multiScatteringAt(altitude, mu, ms);
        for (let channel = 0; channel < 3; channel += 1) {
          const tView = Math.exp(-(
            coeffs.betaR[channel] * opticalR + coeffs.betaMExt * opticalM
          ));
          accumR[channel] += tView * sunT[channel] * densityR * dt;
          accumM[channel] += tView * sunT[channel] * densityM * dt;
          const sigmaS = coeffs.betaR[channel] * densityR + coeffs.betaM * densityM;
          accumMS[channel] += tView * ms[channel] * sigmaS * dt;
        }
      }
      const cosTheta = Math.min(Math.max(vx * sx + vy * sy + vz * sz, -1), 1);
      const phaseR = (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
      const phaseM = mieAtmospherePhaseCpu(cosTheta, mieDirectionalG);
      const luminance = [0, 0, 0];
      const transmittance = [0, 0, 0];
      for (let channel = 0; channel < 3; channel += 1) {
        luminance[channel] = sunIrradiance[channel] * (
          coeffs.betaR[channel] * accumR[channel] * phaseR
          + coeffs.betaM * accumM[channel] * phaseM * mieScatteringStrength
          + accumMS[channel] * skyMultipleScattering
        );
        transmittance[channel] = Math.exp(-(
          coeffs.betaR[channel] * opticalR + coeffs.betaMExt * opticalM
        ));
      }
      return { luminance, transmittance, groundHit: 0, distanceKm: tMax };
    },
    dispose() {
      transmittanceTexture.dispose();
      multiScatteringTexture.dispose();
    },
  };
}

/** Exact LUT-assisted view marcher shared by the dome and aerial perspective. */
export function atmosphereRaymarchNodes({
  scattering,
  viewDir,
  sunDir,
  sunIrradiance,
  mieDirectionalG,
  mieScatteringStrength,
  skyMultipleScattering,
  steps = VIEW_MARCH_STEPS,
  maxDistanceKm = null,
  densityScale = null,
}) {
  const direction = normalize(vec3(viewDir.x, max(viewDir.y, 0.001), viewDir.z)).toVar();
  const lightDirection = normalize(sunDir).toVar();
  const originHeight = float(EARTH_R + 0.0001);
  const origin = vec3(0, originHeight, 0);
  const b = originHeight.mul(direction.y).mul(2);
  const c = originHeight.mul(originHeight).sub(ATMO_R * ATMO_R);
  const atmosphereDistance = b.negate()
    .add(sqrt(max(b.mul(b).sub(c.mul(4)), 0)))
    .mul(0.5);
  const tMax = maxDistanceKm === null
    ? atmosphereDistance.toVar()
    : min(atmosphereDistance, maxDistanceKm).toVar();
  const accumR = vec3(0).toVar();
  const accumM = vec3(0).toVar();
  const accumMS = vec3(0).toVar();
  const opticalR = float(0).toVar();
  const opticalM = float(0).toVar();
  const dtCoefficient = tMax.mul(2 / steps).toVar();
  const betaR = scattering.medium.rayleighScattering;
  const betaM = scattering.medium.mieScattering;
  const betaMExt = scattering.medium.mieExtinction;

  Loop(steps, ({ i }) => {
    const u = float(i).add(0.5).div(steps);
    const t = u.mul(u).mul(tMax);
    const dt = u.mul(dtCoefficient);
    const position = origin.add(direction.mul(t));
    const pLength = length(position).toVar();
    const altitude = max(pLength.sub(EARTH_R), 0).toVar();
    const densityR = densityScale === null
      ? exp(altitude.div(-HR)).toVar()
      : exp(altitude.div(-HR)).mul(densityScale).toVar();
    const densityM = densityScale === null
      ? exp(altitude.div(-HM)).toVar()
      : exp(altitude.div(-HM)).mul(densityScale).toVar();
    opticalR.addAssign(densityR.mul(dt));
    opticalM.addAssign(densityM.mul(dt));
    const mu = dot(position, lightDirection).div(pLength).toVar();
    const sunT = scattering.transmittanceNode(altitude, mu).toVar();
    const viewT = exp(betaR.mul(opticalR).add(betaMExt.mul(opticalM)).negate()).toVar();
    accumR.addAssign(viewT.mul(sunT).mul(densityR).mul(dt));
    accumM.addAssign(viewT.mul(sunT).mul(densityM).mul(dt));
    const sigmaS = betaR.mul(densityR).add(betaM.mul(densityM));
    accumMS.addAssign(
      viewT.mul(scattering.multiScatteringNode(altitude, mu)).mul(sigmaS).mul(dt),
    );
  });

  const cosTheta = dot(direction, lightDirection).toVar();
  const luminance = betaR.mul(accumR).mul(rayleighPhaseNode(cosTheta))
    .add(betaM.mul(accumM).mul(mieAtmospherePhaseNode(cosTheta, mieDirectionalG))
      .mul(mieScatteringStrength))
    .add(accumMS.mul(skyMultipleScattering))
    .mul(sunIrradiance)
    .toVar();
  const transmittance = exp(
    betaR.mul(opticalR).add(betaMExt.mul(opticalM)).negate(),
  ).toVar();
  return { luminance, transmittance, groundHit: float(0), distanceKm: tMax };
}
