// Opaque stylized material for trunks, branches, roots, and other woody
// surfaces. Bark is intentionally not routed through thin-surface lighting:
// it shares the IP lighting/weather treatment, but owns its toon ramp and
// woody accents independently from leaves, petals, and grass blades.

import * as THREE from 'three';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  floor,
  Fn,
  max,
  mix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import {
  createVegetationStyleUniforms,
  tagVegetationRole,
} from './chunks/vegetation-style.js';

function resolveSrgbColor(value, fallback) {
  if (value?.isColor) return value.clone();
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Color().setRGB(
      Number(value[0]) || 0,
      Number(value[1]) || 0,
      Number(value[2]) || 0,
      THREE.SRGBColorSpace,
    );
  }
  return new THREE.Color(value ?? fallback);
}

export function createWoodySurfaceNodeMaterial({
  color = 0xc9ab8a,
  height = 1,
  map = null,
  sceneShadowStrength = 1,
  vegetationShader = null,
} = {}) {
  const u = {
    uBaseColor: uniform(resolveSrgbColor(color, 0xc9ab8a)),
    uHeight: uniform(Math.max(Number(height) || 1, 1e-3)),
    uSceneShadowStrength: uniform(THREE.MathUtils.clamp(
      Number(sceneShadowStrength) || 0,
      0,
      1,
    )),
    uSkyColor: uniform(new THREE.Color().setRGB(0.72, 0.87, 1, THREE.SRGBColorSpace)),
    uSunColor: uniform(new THREE.Color().setRGB(1, 0.96, 0.86, THREE.SRGBColorSpace)),
    uSunDirection: uniform(new THREE.Vector3(0.45, 0.75, 0.5).normalize()),
    ...createVegetationStyleUniforms(vegetationShader, 'woodySurface'),
  };
  const albedo = map ? texture(map).rgb.mul(u.uBaseColor) : u.uBaseColor;

  const material = new NodeMaterial();
  material.name = 'StylizedWoodySurface';
  material.color = u.uBaseColor.value.clone();
  material.fog = true;
  material.map = map;
  material.userData.bakedBaseColor = u.uBaseColor.value.getHex();
  material.fragmentNode = Fn(() => {
    const normal = normalize(mix(
      normalWorld,
      normalize(vec3(normalWorld.x, normalWorld.y.mul(0.35), normalWorld.z)),
      u.uStyleBarkNormalFlatness,
    ));
    const sunDirection = normalize(u.uSunDirection);
    const light = clamp(dot(normal, sunDirection).mul(0.5).add(0.5), 0, 1).toVar();
    const steps = max(floor(u.uStyleBarkBandCount), 2);
    const intervals = max(steps.sub(1), 1);
    const hardBand = floor(light.mul(intervals).add(1e-4)).div(intervals);
    const band = mix(hardBand, light, u.uStyleBarkBandSoftness).toVar();
    const visibility = mix(
      1,
      sampleEnvironmentSunShadow(positionWorld),
      u.uSceneShadowStrength,
    ).mul(sampleEnvironmentCloudShadow(positionWorld, 1)).toVar();
    const lit = band.mul(visibility).toVar();

    const localHeight = clamp(positionLocal.y.div(u.uHeight), 0, 1);
    const verticalShade = mix(
      u.uStyleBarkVerticalShadeStrength.oneMinus(),
      1,
      localHeight,
    );
    const styledAlbedo = mix(
      albedo,
      albedo.mul(u.uStyleBarkTint),
      u.uStyleBarkTintStrength,
    );
    const colorNode = styledAlbedo.mul(mix(u.uStyleBarkShadowFloor, 1, lit))
      .mul(verticalShade).toVar();

    const shadowAmount = visibility.oneMinus()
      .mul(u.uStyleLightingShadowTintStrength);
    colorNode.mulAssign(mix(
      vec3(1),
      u.uStyleLightingShadowTint,
      clamp(shadowAmount, 0, 1),
    ));
    colorNode.mulAssign(mix(
      vec3(1),
      u.uSunColor,
      lit.mul(u.uStyleLightingSunTintStrength.add(u.uStyleBarkSunTintStrength)),
    ));
    colorNode.addAssign(
      styledAlbedo.mul(u.uSkyColor).mul(lit.oneMinus())
        .mul(u.uStyleLightingSkyFillStrength.add(u.uStyleBarkSkyFillStrength)),
    );

    const viewDirection = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(
      clamp(abs(dot(normal, viewDirection)).oneMinus(), 0, 1),
      u.uStyleLightingRimPower,
    );
    colorNode.addAssign(
      styledAlbedo.mul(u.uSkyColor).mul(rim)
        .mul(u.uStyleLightingRimStrength.add(u.uStyleBarkRimStrength)),
    );

    const halfVector = normalize(sunDirection.add(viewDirection));
    const specularPower = mix(96, 8, u.uStyleBarkRoughness);
    const specular = pow(clamp(dot(normal, halfVector), 0, 1), specularPower)
      .mul(visibility).mul(u.uStyleBarkSpecularStrength);

    const wet = clamp(u.uWetness.mul(u.uWetnessResponse), 0, 1).toVar();
    colorNode.mulAssign(wet.mul(u.uStyleWeatherResponseWetDarkening).oneMinus());
    const luminance = dot(colorNode, vec3(0.299, 0.587, 0.114));
    colorNode.assign(mix(
      colorNode,
      vec3(luminance),
      wet.mul(u.uStyleWeatherResponseWetDesaturation),
    ));
    colorNode.addAssign(
      u.uSunColor.mul(specular.add(
        wet.mul(u.uStyleWeatherResponseWetHighlightStrength)
          .mul(rim.mul(0.5).add(0.08)),
      )),
    );

    const snowSoftness = u.uStyleWeatherResponseSnowEdgeSoftness.max(0.001);
    const snowFacing = smoothstep(
      snowSoftness.mul(-0.25),
      snowSoftness.mul(0.75),
      normal.y,
    );
    const snow = clamp(u.uSnowCover.mul(u.uSnowRetention).mul(snowFacing), 0, 1);
    const snowTint = u.uStyleWeatherResponseSnowTint.mul(mix(
      u.uStyleWeatherResponseSnowShadowStrength,
      1,
      visibility,
    ));
    colorNode.assign(mix(colorNode, snowTint, snow));
    const sceneLight = clamp(
      u.uSkyIntensity.mul(0.5)
        .add(u.uSunIntensity.mul(0.5).mul(band)),
      0,
      1.5,
    );
    colorNode.mulAssign(sceneLight);
    colorNode.addAssign(styledAlbedo.mul(u.uStyleBarkEmissiveStrength));

    return vec4(colorNode, 1);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, 'woodySurface', 'mesh');
}

export function setWoodySurfaceSun(material, {
  color = [1, 0.96, 0.86],
  direction = [0.45, 0.75, 0.5],
  intensity,
  sky = [0.72, 0.87, 1],
  skyIntensity,
} = {}) {
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  uniforms.uSunDirection?.value.set(...direction).normalize();
  uniforms.uSunColor?.value.setRGB(...color, THREE.SRGBColorSpace);
  uniforms.uSkyColor?.value.setRGB(...sky, THREE.SRGBColorSpace);
  if (Number.isFinite(intensity) && uniforms.uSunIntensity) {
    uniforms.uSunIntensity.value = Math.max(intensity, 0);
  }
  if (Number.isFinite(skyIntensity) && uniforms.uSkyIntensity) {
    uniforms.uSkyIntensity.value = Math.max(skyIntensity, 0);
  }
  return material;
}
