// TSL port of src/shaders/chunks/environment-fragment-lighting.glsl — the
// wrapped-diffuse light bands, banded Blinn-Phong specular, six-direction
// ambient-probe irradiance, and the derivative-TBN normal perturbation.
//
// Scene light data comes from the shared toonSceneLights uniforms
// (character/sceneLights.js) instead of three's <lights_pars_begin>
// blocks; syncToonSceneLights replicates WebGLLights' view-space conventions,
// so the light ingredients match what the GLSL loops consumed. The GLSL
// directionalLights[i] loop is evaluated against the mirrored main light —
// environment scenes use a single sun, and the NUM_DIR_LIGHTS == 0 fallback
// (L = normalize(vec3(0.35, 0.75, 0.55)), white color) maps onto
// hasMainLight = 0 with identical band math.
//
// NOTE (preserved GLSL quirk): the wrapped diffuse terms dot the "world"
// normal — which the vertex stage actually writes in VIEW space — against
// three's view-space light data. That mismatch is part of the approved
// baseline look, so it is ported as-is; the specular term additionally
// re-applies the view matrix to the already-view-space normal, exactly like
// the GLSL did.
//
// GLSL out-parameters (strongestLight) become returned { light, strongest }
// node-var pairs. Uniform-driven early returns keep their If() shape.

import {
  clamp,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  Fn,
  If,
  inverseSqrt,
  length,
  max,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';

import {
  getMainLightDirection,
  MAX_TOON_POINT_LIGHTS,
  MAX_TOON_SPOT_LIGHTS,
  toonSceneLights,
} from '../character/sceneLights.js';

function maxComponent3(value) {
  return max(value.r, max(value.g, value.b));
}

// three's getDistanceAttenuation (common.glsl) — physically based falloff
// with the artist cutoff window, matching getPointLightInfo/getSpotLightInfo.
const distanceAttenuation = /*@__PURE__*/ Fn(([lightDistance, cutoffDistance, decayExponent]) => {
  const distanceFalloff = float(1.0).div(max(pow(lightDistance, decayExponent), 0.01)).toVar();
  If(cutoffDistance.greaterThan(0.0), () => {
    const ratio = lightDistance.div(cutoffDistance);
    const ratio2 = ratio.mul(ratio);
    const window1 = ratio2.mul(ratio2).oneMinus().clamp(0.0, 1.0);
    distanceFalloff.mulAssign(window1.mul(window1));
  });
  return distanceFalloff;
});

export function createEnvironmentLightingChunk({ u, tex, flags, cameraViewMatrixNode }) {
  const s = toonSceneLights;

  // The wrapped half-Lambert curve (0.16..0.86 smoothstep window) is the
  // canonical toonlab band; consumers outside this stitched shader must keep
  // the constants in step (see the GLSL chunk header).
  const evaluateDirectionalLight = (normal) => {
    const strongest = float(0.0).toVar();
    const light = vec3(0.0).toVar();
    If(u.enableDirectionalLights.greaterThanEqual(0.5), () => {
      // GLSL NUM_DIR_LIGHTS > 0 uses directionalLights[0]; NUM_DIR_LIGHTS == 0
      // falls back to the fixed direction with white color. Both cases share
      // the band formulas, so hasMainLight selects between them at runtime.
      const L = getMainLightDirection();
      const lightColor = mix(vec3(1.0), s.mainLightColor, s.hasMainLight);
      const halfLambert = dot(normal, L).mul(0.5).add(0.5);
      const wrappedLight = smoothstep(
        float(0.16).sub(u.shadeSoftness),
        float(0.86).add(u.shadeSoftness),
        halfLambert,
      );
      const lightBand = mix(1.0, wrappedLight, u.shadeStrength);
      strongest.assign(wrappedLight);
      light.assign(lightColor.mul(lightBand));
    });
    return { light, strongest };
  };

  const evaluatePointLights = (normal, geometryPosition) => {
    const strongest = float(0.0).toVar();
    const light = vec3(0.0).toVar();
    If(u.enablePointLights.greaterThanEqual(0.5), () => {
      for (let i = 0; i < MAX_TOON_POINT_LIGHTS; i += 1) {
        If(float(i).lessThan(s.pointLightCount), () => {
          // getPointLightInfo(pointLights[i], geometryPosition, pointLight)
          const lVector = s.pointLightPositions.element(i).sub(geometryPosition);
          const lightDistance = length(lVector);
          const direction = lVector.div(max(lightDistance, 1e-6));
          const params = s.pointLightParams.element(i);
          const attenuation = distanceAttenuation(lightDistance, params.x, params.y);
          const color = s.pointLightColors.element(i).mul(attenuation).toVar();
          If(maxComponent3(color).greaterThan(0.0), () => { // pointLight.visible
            const halfLambert = dot(normal, direction).mul(0.5).add(0.5);
            const wrappedLight = smoothstep(0.08, 0.88, halfLambert);
            const lightBand = mix(0.18, wrappedLight, u.shadeStrength);
            strongest.assign(max(strongest, wrappedLight.mul(maxComponent3(color))));
            light.addAssign(color.mul(lightBand));
          });
        });
      }
    });
    return { light, strongest };
  };

  const evaluateSpotLights = (normal, geometryPosition) => {
    const strongest = float(0.0).toVar();
    const light = vec3(0.0).toVar();
    If(u.enableSpotLights.greaterThanEqual(0.5).and(u.spotLightStrength.greaterThan(0.0)), () => {
      for (let i = 0; i < MAX_TOON_SPOT_LIGHTS; i += 1) {
        If(float(i).lessThan(s.spotLightCount), () => {
          // getSpotLightInfo(spotLights[i], geometryPosition, spotLight)
          const lVector = s.spotLightPositions.element(i).sub(geometryPosition);
          const lightDistance = length(lVector);
          const direction = lVector.div(max(lightDistance, 1e-6));
          const params = s.spotLightParams.element(i);
          const angleCos = dot(direction, normalize(s.spotLightDirections.element(i)));
          const spotAttenuation = smoothstep(params.z, params.w, angleCos);
          const attenuation = distanceAttenuation(lightDistance, params.x, params.y)
            .mul(spotAttenuation);
          const color = s.spotLightColors.element(i).mul(attenuation).toVar();
          If(maxComponent3(color).greaterThan(0.0), () => { // spotLight.visible
            const halfLambert = dot(normal, direction).mul(0.5).add(0.5);
            const wrappedLight = smoothstep(0.08, 0.88, halfLambert);
            const lightBand = mix(0.12, wrappedLight, u.shadeStrength);
            strongest.assign(max(strongest, wrappedLight.mul(maxComponent3(color))));
            light.addAssign(color.mul(lightBand));
          });
        });
      }
    });
    return { light, strongest };
  };

  // Banded Blinn-Phong highlight for glossy interiors. The GLSL transforms
  // its (already view-space, see quirk note above) normal by viewMatrix again
  // — ported verbatim for parity.
  const evaluateEnvironmentSpecular = (worldNormal, geometryPosition, sunlightVisibility) => {
    const result = vec3(0.0).toVar();
    const normalView = normalize(cameraViewMatrixNode.mul(vec4(worldNormal, 0.0)).xyz);
    const viewDir = normalize(geometryPosition.negate());

    const bandedSpecular = (lightDirection) => {
      const halfDir = normalize(normalize(lightDirection).add(viewDir));
      const spec = pow(max(dot(normalView, halfDir), 0.0), u.specularShininess);
      return smoothstep(
        float(0.5).sub(u.specularSoftness),
        float(0.5).add(u.specularSoftness),
        spec,
      );
    };

    // Directional loop — main light only, gated on presence (the GLSL
    // NUM_DIR_LIGHTS == 0 build compiles no directional specular at all).
    If(s.hasMainLight.greaterThan(0.5), () => {
      const spec = bandedSpecular(s.mainLightDirection);
      result.addAssign(s.mainLightColor.mul(spec).mul(sunlightVisibility));
    });

    for (let i = 0; i < MAX_TOON_POINT_LIGHTS; i += 1) {
      If(float(i).lessThan(s.pointLightCount), () => {
        const lVector = s.pointLightPositions.element(i).sub(geometryPosition);
        const lightDistance = length(lVector);
        const direction = lVector.div(max(lightDistance, 1e-6));
        const params = s.pointLightParams.element(i);
        const attenuation = distanceAttenuation(lightDistance, params.x, params.y);
        const color = s.pointLightColors.element(i).mul(attenuation).toVar();
        If(maxComponent3(color).greaterThan(0.0), () => {
          result.addAssign(color.mul(bandedSpecular(direction)));
        });
      });
    }

    for (let i = 0; i < MAX_TOON_SPOT_LIGHTS; i += 1) {
      If(float(i).lessThan(s.spotLightCount), () => {
        const lVector = s.spotLightPositions.element(i).sub(geometryPosition);
        const lightDistance = length(lVector);
        const direction = lVector.div(max(lightDistance, 1e-6));
        const params = s.spotLightParams.element(i);
        const angleCos = dot(direction, normalize(s.spotLightDirections.element(i)));
        const spotAttenuation = smoothstep(params.z, params.w, angleCos);
        const attenuation = distanceAttenuation(lightDistance, params.x, params.y)
          .mul(spotAttenuation);
        const color = s.spotLightColors.element(i).mul(attenuation).toVar();
        If(maxComponent3(color).greaterThan(0.0), () => {
          result.addAssign(color.mul(bandedSpecular(direction)));
        });
      });
    }

    return result;
  };

  // Six-direction irradiance from the scene ambient probe (shared uniform
  // array). Element access on uniform arrays is a pure expression, so the
  // ternaries stay select()s like the GLSL.
  const environmentProbeIrradiance = (normal) => {
    const probe = u.ambientProbe;
    const weights = normal.mul(normal);
    const x = select(normal.x.greaterThanEqual(0.0), probe.element(0), probe.element(1));
    const y = select(normal.y.greaterThanEqual(0.0), probe.element(2), probe.element(3));
    const z = select(normal.z.greaterThanEqual(0.0), probe.element(4), probe.element(5));
    return x.mul(weights.x).add(y.mul(weights.y)).add(z.mul(weights.z));
  };

  // Derivative-TBN normal perturbation (mirrors three's tangentless
  // normal_fragment_maps path) — only built when the material has a normal
  // map (the USE_ENV_NORMAL_MAP define analog).
  const perturbEnvironmentNormal = flags.hasNormalMap
    ? (normal, worldPosition, uvNode) => {
      const mapN = tex.normalMapTex.sample(uvNode).xyz.mul(2.0).sub(1.0).toVar();
      mapN.xy.mulAssign(u.normalMapScale.mul(u.normalMapStrength));

      const q0 = dFdx(worldPosition);
      const q1 = dFdy(worldPosition);
      const st0 = dFdx(uvNode);
      const st1 = dFdy(uvNode);

      const n = normalize(normal);
      const q1perp = cross(q1, n);
      const q0perp = cross(n, q0);
      const tangent = q1perp.mul(st0.x).add(q0perp.mul(st1.x));
      const bitangent = q1perp.mul(st0.y).add(q0perp.mul(st1.y));

      const det = max(dot(tangent, tangent), dot(bitangent, bitangent));
      const scale = select(det.equal(0.0), float(0.0), inverseSqrt(det));
      return normalize(
        tangent.mul(mapN.x.mul(scale))
          .add(bitangent.mul(mapN.y.mul(scale)))
          .add(n.mul(mapN.z)),
      );
    }
    : null;

  return {
    environmentProbeIrradiance,
    evaluateDirectionalLight,
    evaluateEnvironmentSpecular,
    evaluatePointLights,
    evaluateSpotLights,
    perturbEnvironmentNormal,
  };
}
