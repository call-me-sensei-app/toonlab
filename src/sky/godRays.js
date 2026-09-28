// God-ray parameters and post-process march. Step count comes from the quality
// tier; tint follows the active sun or moon.

import * as THREE from 'three';
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  exp,
  float,
  fract,
  max,
  min,
  mix,
  pow,
  screenCoordinate,
  screenUV,
  smoothstep,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

import { henyeyGreensteinPhaseNode } from './atmosphereScattering.js';
import { sampleCloudShadowNode } from './cloudShadow.js';

export const GOD_RAYS_PARAM_SCHEMA = Object.freeze({
  enabled: Object.freeze({
    description: 'Runs or skips the shaft march. The quality tier also sets this; the low tier disables it.',
    label: 'Enabled',
    type: 'boolean',
    unit: '',
    value: true,
  }),
  strength: Object.freeze({
    description: 'How fast shafts approach their brightness ceiling. The result is soft-clipped, so raising this reaches the light colour sooner rather than growing without limit.',
    label: 'Strength',
    range: Object.freeze({ max: 8, min: 0, step: 0.01 }),
    type: 'number',
    unit: '',
    value: 2,
  }),
  sharpness: Object.freeze({
    description: 'Contrast of the shafts, applied as a gamma on sampled light visibility. 1 leaves visibility untouched.',
    label: 'Sharpness',
    range: Object.freeze({ max: 16, min: 1, step: 0.01 }),
    type: 'number',
    unit: '',
    value: 2,
  }),
  extinction: Object.freeze({
    description: 'Haze the shafts travel through. The same value scatters light in and absorbs it along the way, so raising it makes shafts denser but shorter.',
    label: 'Extinction',
    range: Object.freeze({ max: 0.001, min: 0, step: 0.00001 }),
    type: 'number',
    unit: '1/m',
    value: 0.0002,
  }),
  maxDistance: Object.freeze({
    description: 'How far the march runs for pixels showing open sky. Pixels showing geometry stop at the surface, and shafts fade at the cloud-shadow box edge.',
    label: 'Max Distance',
    range: Object.freeze({ max: 20000, min: 1000, step: 10 }),
    type: 'number',
    unit: 'm',
    value: 12500,
  }),
  moonGodRayScale: Object.freeze({
    description: 'Shaft brightness while the moon is the active light. The sun uses strength directly.',
    label: 'Moon Scale',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    unit: '',
    value: 0.4,
  }),
});

export const GOD_RAYS_PARAM_KEYS = Object.freeze(Object.keys(GOD_RAYS_PARAM_SCHEMA));

export const DEFAULT_GOD_RAYS_PARAMS = Object.freeze(
  Object.fromEntries(GOD_RAYS_PARAM_KEYS.map((key) => [key, GOD_RAYS_PARAM_SCHEMA[key].value])),
);

const GOD_RAY_BOX_FADE_START = 0.8;
const GOD_RAY_MIN_LIGHT_ELEVATION = 0.05;
const GOD_RAY_GRAZING_FADE_END = 0.2;
const GOD_RAY_NIGHT_THRESHOLD = (-6 * Math.PI) / 180;
const moonTintTarget = new THREE.Color(1, 1, 1);

function smoothstepValue(edge0, edge1, value) {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

function projectToGroundNode(position, lightDirection, inverseLightY, groundCenter) {
  const distance = position.y.sub(groundCenter.y).mul(inverseLightY);
  return vec3(
    position.x.sub(lightDirection.x.mul(distance)),
    groundCenter.y,
    position.z.sub(lightDirection.z.mul(distance)),
  );
}

function getShadowEdgeFadeNode(shadowPosition, projection) {
  const relative = shadowPosition.sub(projection.center);
  const u = abs(dot(relative, projection.axisU)).div(projection.extent);
  const v = abs(dot(relative, projection.axisV)).div(projection.extent);
  const edge = max(u, v);
  return clamp(float(1).sub(smoothstep(GOD_RAY_BOX_FADE_START, 1, edge)), 0, 1);
}

/**
 * Volumetric light-shaft march. It samples the baked cloud-shadow map
 * once per view step and stops at the nearer of scene geometry and cloud.
 */
export function createGodRaysPass({
  atmosphere,
  cameraPosition,
  cloudColorNode,
  cloudDepthNode,
  godRays,
  shadowProjection,
  shadowMapNode,
  sun,
  timeOfDay = null,
} = {}) {
  if (!atmosphere?.mieDirectionalG || !cameraPosition || !godRays?.steps) {
    throw new TypeError('createGodRaysPass needs atmosphere, camera and god-ray state.');
  }
  if (!shadowProjection || !shadowMapNode || !sun?.direction) {
    throw new TypeError('createGodRaysPass needs the cloud-shadow bake and sun.');
  }

  const enabledUniform = uniform(godRays.enabled ? 1 : 0);
  const lightAboveHorizon = uniform(1);
  const lightColor = uniform(new THREE.Color(1, 1, 1));
  const lightScale = uniform(1);
  const lightDirection = uniform(new THREE.Vector3(0, 1, 0));
  const inverseLightY = uniform(1);
  const moonColorScratch = new THREE.Color();

  const getMarchEndNode = (sceneDistance) => {
    const cloudTransmittance = cloudColorNode.sample(screenUV).a;
    const cloudCoverage = cloudTransmittance
      .oneMinus()
      .mul(shadowProjection.enabled);
    const cloudHit = cloudDepthNode.sample(screenUV).r;
    const cloudInFront = step(cloudHit, sceneDistance);
    return mix(sceneDistance, cloudHit, cloudCoverage.mul(cloudInFront));
  };

  const marchGodRaysNode = (viewDirection, sceneDistance) => Fn(() => {
    const end = min(getMarchEndNode(sceneDistance), godRays.maxDistance).toVar();
    const radiance = vec3(0).toVar();

    If(enabledUniform.mul(lightAboveHorizon).greaterThan(0.5), () => {
      const phase = henyeyGreensteinPhaseNode(
        dot(viewDirection, lightDirection),
        atmosphere.mieDirectionalG,
      ).toVar();
      const stepLength = end.div(godRays.steps).toVar();
      const pixel = screenCoordinate.xy;
      const noise = fract(
        float(52.9829189).mul(
          fract(pixel.x.mul(0.06711056).add(pixel.y.mul(0.00583715))),
        ),
      ).toVar();
      const stepTransmittance = exp(godRays.extinction.mul(stepLength).negate()).toVar();
      const stepScatter = stepTransmittance.oneMinus().toVar();
      const baseScatter = vec3(lightColor).mul(lightScale).mul(phase).toVar();
      const transmittance = float(1).toVar();

      Loop(godRays.steps, ({ i }) => {
        const distance = float(i).add(noise).mul(stepLength);
        const position = cameraPosition.add(viewDirection.mul(distance)).toVar();
        const shadowPosition = projectToGroundNode(
          position,
          lightDirection,
          inverseLightY,
          shadowProjection.center,
        );
        const visibility = pow(
          clamp(
            sampleCloudShadowNode(
              shadowPosition,
              shadowMapNode,
              shadowProjection,
            ),
            0,
            1,
          ),
          godRays.sharpness,
        );
        const inScatter = baseScatter
          .mul(visibility)
          .mul(getShadowEdgeFadeNode(shadowPosition, shadowProjection));
        radiance.addAssign(transmittance.mul(inScatter).mul(stepScatter));
        transmittance.mulAssign(stepTransmittance);
      });
    });

    return vec3(1).sub(exp(radiance.mul(godRays.strength).negate()));
  })();

  return {
    enabledUniform,
    inverseLightY,
    lightAboveHorizon,
    lightColor,
    lightDirection,
    lightScale,
    marchGodRaysNode,

    applyTo(sceneColor, viewDirection, sceneDistance) {
      const rays = marchGodRaysNode(viewDirection, sceneDistance);
      return Fn(() => {
        const source = vec4(sceneColor).toVar();
        return vec4(source.rgb.add(rays), source.a);
      })();
    },

    update() {
      enabledUniform.value = godRays.enabled ? 1 : 0;
      const sunDirection = sun.direction.value;
      const sunElevation = Math.asin(Math.max(-1, Math.min(1, sunDirection.y)));
      const sunIsActive = !timeOfDay || sunElevation >= GOD_RAY_NIGHT_THRESHOLD;

      let direction;
      let color;
      let scale;
      if (sunIsActive) {
        direction = sunDirection;
        color = sun.color.value;
        scale = 1;
      } else {
        direction = timeOfDay.moonDirection.value;
        color = moonColorScratch.copy(timeOfDay.moonColor.value).lerp(moonTintTarget, 0.3);
        scale = godRays.moonGodRayScale;
      }

      lightColor.value.copy(color);
      lightDirection.value.copy(direction);
      lightScale.value = scale * smoothstepValue(
        GOD_RAY_MIN_LIGHT_ELEVATION,
        GOD_RAY_GRAZING_FADE_END,
        direction.y,
      );
      inverseLightY.value = 1 / Math.max(direction.y, GOD_RAY_MIN_LIGHT_ELEVATION);
      lightAboveHorizon.value = direction.y > 0 ? 1 : 0;
    },

    dispose() {},
  };
}
