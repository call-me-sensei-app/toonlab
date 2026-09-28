// CPU ambient-light bake used by the cloud shader.
//
// Two low-frequency sky samples (zenith and sunward horizon), ground-bounce
// irradiance, and direct-sun tint are evaluated only when their inputs change.
// Keeping them as uniforms avoids another atmosphere march per cloud sample.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

const EARTH_R = 6371;
const ATMO_R = 6471;
const HR = 8;
const HM = 1.2;
const BETA_R = [5.802e-3, 13.558e-3, 33.1e-3];
const BETA_M_BASE = 21e-3;
const MIE_EXTINCTION_FACTOR = 1.1;
const PHASE_ISO = 1 / (4 * Math.PI);
const N_OUTER = 16;
const N_INNER = 8;
const SUN_DIR_REBAKE_COS_EPSILON = 1e-5;

const origin = new THREE.Vector3(0, EARTH_R + 0.0001, 0);
const viewScratch = new THREE.Vector3();
const sunScratch = new THREE.Vector3();
const pointScratch = new THREE.Vector3();
const lightPointScratch = new THREE.Vector3();
const diffuseDirection = new THREE.Vector3();
const diffuseSample = new THREE.Vector3();

function isGroundBlocked(point, direction) {
  const b = 2 * point.dot(direction);
  const c = point.dot(point) - EARTH_R * EARTH_R;
  const discriminant = b * b - 4 * c;
  if (discriminant <= 0) return false;
  return (-b - Math.sqrt(discriminant)) * 0.5 > 0;
}

function bakeAmbient(viewDirection, sunDirection, turbidity, multipleScattering, rayleigh, out) {
  viewScratch.set(viewDirection.x, Math.max(viewDirection.y, 0.001), viewDirection.z).normalize();
  sunScratch.copy(sunDirection).normalize();

  const bView = 2 * origin.dot(viewScratch);
  const cView = origin.dot(origin) - ATMO_R * ATMO_R;
  const tAtmosphere = (-bView + Math.sqrt(Math.max(bView * bView - 4 * cView, 0))) * 0.5;
  const dtCoefficient = (2 * tAtmosphere) / N_OUTER;

  const betaR = BETA_R.map((value) => value * rayleigh);
  const betaM = BETA_M_BASE * turbidity;
  const accumR = [0, 0, 0];
  const accumM = [0, 0, 0];
  let opticalR = 0;
  let opticalM = 0;

  for (let i = 0; i < N_OUTER; i += 1) {
    const u = (i + 0.5) / N_OUTER;
    const t = u * u * tAtmosphere;
    const dtView = u * dtCoefficient;
    pointScratch.copy(viewScratch).multiplyScalar(t).add(origin);
    const height = Math.max(pointScratch.length() - EARTH_R, 0);
    const densityR = Math.exp(-height / HR);
    const densityM = Math.exp(-height / HM);
    opticalR += densityR * dtView;
    opticalM += densityM * dtView;

    if (isGroundBlocked(pointScratch, sunScratch)) continue;

    const bLight = 2 * pointScratch.dot(sunScratch);
    const cLight = pointScratch.dot(pointScratch) - ATMO_R * ATMO_R;
    const tSun = Math.max(
      (-bLight + Math.sqrt(Math.max(bLight * bLight - 4 * cLight, 0))) * 0.5,
      0.0001,
    );
    const dtLight = tSun / N_INNER;
    let opticalLightR = 0;
    let opticalLightM = 0;
    for (let j = 0; j < N_INNER; j += 1) {
      const distance = (j + 0.5) * dtLight;
      lightPointScratch.copy(sunScratch).multiplyScalar(distance).add(pointScratch);
      const lightHeight = Math.max(lightPointScratch.length() - EARTH_R, 0);
      opticalLightR += Math.exp(-lightHeight / HR) * dtLight;
      opticalLightM += Math.exp(-lightHeight / HM) * dtLight;
    }

    const totalR = opticalR + opticalLightR;
    const totalM = opticalM + opticalLightM;
    for (let channel = 0; channel < 3; channel += 1) {
      const tau = betaR[channel] * totalR
        + betaM * MIE_EXTINCTION_FACTOR * totalM;
      const transmittance = Math.exp(-tau);
      accumR[channel] += transmittance * densityR * dtView;
      accumM[channel] += transmittance * densityM * dtView;
    }
  }

  const msFactor = 1 + multipleScattering;
  out.set(
    PHASE_ISO * (betaR[0] * accumR[0] * msFactor + betaM * accumM[0]),
    PHASE_ISO * (betaR[1] * accumR[1] * msFactor + betaM * accumM[1]),
    PHASE_ISO * (betaR[2] * accumR[2] * msFactor + betaM * accumM[2]),
  );
}

function bakeSunTransmittance(sunDirection, turbidity, rayleigh, out) {
  sunScratch.copy(sunDirection).normalize();
  if (isGroundBlocked(origin, sunScratch)) {
    out.set(0, 0, 0);
    return;
  }
  const b = 2 * origin.dot(sunScratch);
  const c = origin.dot(origin) - ATMO_R * ATMO_R;
  const tExit = (-b + Math.sqrt(Math.max(b * b - 4 * c, 0))) * 0.5;
  const dt = tExit / 6;
  let opticalR = 0;
  let opticalM = 0;
  for (let i = 0; i < 6; i += 1) {
    const distance = (i + 0.5) * dt;
    lightPointScratch.copy(sunScratch).multiplyScalar(distance).add(origin);
    const height = Math.max(lightPointScratch.length() - EARTH_R, 0);
    opticalR += Math.exp(-height / HR) * dt;
    opticalM += Math.exp(-height / HM) * dt;
  }
  const betaM = BETA_M_BASE * turbidity;
  out.set(
    Math.exp(-(BETA_R[0] * rayleigh * opticalR + betaM * MIE_EXTINCTION_FACTOR * opticalM)),
    Math.exp(-(BETA_R[1] * rayleigh * opticalR + betaM * MIE_EXTINCTION_FACTOR * opticalM)),
    Math.exp(-(BETA_R[2] * rayleigh * opticalR + betaM * MIE_EXTINCTION_FACTOR * opticalM)),
  );
}

function bakeSkyDiffuseRadiance(sunDirection, turbidity, multipleScattering, rayleigh, out) {
  let x = 0;
  let y = 0;
  let z = 0;
  let weightSum = 0;
  for (let elevation = 0; elevation < 6; elevation += 1) {
    const theta = ((elevation + 0.5) / 6) * (Math.PI * 0.5);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const weight = cosTheta * sinTheta;
    for (let azimuth = 0; azimuth < 8; azimuth += 1) {
      const phi = ((azimuth + 0.5) / 8) * (2 * Math.PI);
      diffuseDirection.set(
        sinTheta * Math.cos(phi),
        cosTheta,
        sinTheta * Math.sin(phi),
      );
      bakeAmbient(
        diffuseDirection,
        sunDirection,
        turbidity,
        multipleScattering,
        rayleigh,
        diffuseSample,
      );
      x += diffuseSample.x * weight;
      y += diffuseSample.y * weight;
      z += diffuseSample.z * weight;
      weightSum += weight;
    }
  }
  const inverse = weightSum > 0 ? 1 / weightSum : 0;
  out.set(x * inverse, y * inverse, z * inverse);
}

export class AmbientSkyBaker {
  constructor() {
    this.zenithRadiance = uniform(new THREE.Vector3());
    this.horizonRadiance = uniform(new THREE.Vector3());
    this.groundBounceRadiance = uniform(new THREE.Vector3());
    this.sunTransmittance = uniform(new THREE.Vector3(1, 1, 1));
    this._lastRayleigh = Number.NaN;
    this._lastTurbidity = Number.NaN;
    this._lastMultipleScattering = Number.NaN;
    this._lastSunIntensity = Number.NaN;
    this._lastGroundBounceAlbedo = new THREE.Color(Number.NaN, Number.NaN, Number.NaN);
    this._lastSunDirection = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
    this._view = new THREE.Vector3();
    this._horizon = new THREE.Vector3();
    this._out = new THREE.Vector3();
    this._skyDiffuse = new THREE.Vector3();
  }

  update(atmosphere, sun, cloudLighting) {
    const rayleigh = atmosphere.rayleigh.value;
    const turbidity = atmosphere.turbidity.value;
    const multipleScattering = atmosphere.multipleScattering.value;
    const groundAlbedo = cloudLighting.groundBounceAlbedo.value;
    const sunIntensity = sun.intensity.value;
    const sunDirection = sun.direction.value;
    const sunUnchanged = sunDirection.dot(this._lastSunDirection)
      > 1 - SUN_DIR_REBAKE_COS_EPSILON;
    if (rayleigh === this._lastRayleigh
      && turbidity === this._lastTurbidity
      && multipleScattering === this._lastMultipleScattering
      && sunIntensity === this._lastSunIntensity
      && groundAlbedo.equals(this._lastGroundBounceAlbedo)
      && sunUnchanged) return false;

    this._view.set(0, 1, 0);
    bakeAmbient(
      this._view,
      sunDirection,
      turbidity,
      multipleScattering,
      rayleigh,
      this._out,
    );
    this.zenithRadiance.value.copy(this._out).multiplyScalar(sunIntensity);

    this._horizon.set(sunDirection.x, 0.12, sunDirection.z).normalize();
    bakeAmbient(
      this._horizon,
      sunDirection,
      turbidity,
      multipleScattering,
      rayleigh,
      this._out,
    );
    this.horizonRadiance.value.copy(this._out).multiplyScalar(sunIntensity);

    bakeSunTransmittance(sunDirection, turbidity, rayleigh, this._out);
    this.sunTransmittance.value.copy(this._out);

    bakeSkyDiffuseRadiance(
      sunDirection,
      turbidity,
      multipleScattering,
      rayleigh,
      this._skyDiffuse,
    );
    const cosine = Math.max(sunDirection.y, 0);
    const direct = cosine / Math.PI;
    const tint = this.sunTransmittance.value;
    this.groundBounceRadiance.value.set(
      groundAlbedo.r * sunIntensity * (this._skyDiffuse.x + tint.x * direct),
      groundAlbedo.g * sunIntensity * (this._skyDiffuse.y + tint.y * direct),
      groundAlbedo.b * sunIntensity * (this._skyDiffuse.z + tint.z * direct),
    );

    this._lastRayleigh = rayleigh;
    this._lastTurbidity = turbidity;
    this._lastMultipleScattering = multipleScattering;
    this._lastSunIntensity = sunIntensity;
    this._lastGroundBounceAlbedo.copy(groundAlbedo);
    this._lastSunDirection.copy(sunDirection);
    return true;
  }
}
