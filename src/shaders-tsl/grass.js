// TSL port of src/shaders/grass.vert.glsl + grass.frag.glsl — instanced,
// wind-swayed, character-aware stylized grass blades.
//
// Scene-shadow reception (getShadowMask) comes from the shared sun-shadow
// pass; cloud shadows from the stylized-cloud-shadow chunk. Uniforms keep
// their GLSL names on `.uniforms` (StylizedGrassField.applySettings writes
// them by name on both backends).

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  cross,
  Discard,
  distance,
  dot,
  float,
  Fn,
  fract,
  If,
  length,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import { sampleGroundColor } from './chunks/environment-ground-field.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import { shiftNormalizedHue } from './chunks/normalized-hue.js';
import {
  createVegetationStyleUniforms,
  shadeVegetationSurface,
  tagVegetationRole,
} from './chunks/vegetation-style.js';

export function createGrassNodeMaterial(
  settings,
  vegetationShader = null,
  { geometryMode = 'blade', groundField = true } = {},
) {
  const clumpGeometry = geometryMode === 'clump';
  const styleUniforms = createVegetationStyleUniforms(vegetationShader, 'grassBlade');
  const u = {
    uBaseColor: uniform(new THREE.Color()),
    uCloudShadowCoverage: uniform(settings.cloudShadowCoverage),
    uCloudShadowScale: uniform(settings.cloudShadowScale),
    uCloudShadowStrength: uniform(settings.cloudShadowStrength),
    uCloudShadowVelocity: uniform(new THREE.Vector2(settings.cloudShadowVelocity[0], settings.cloudShadowVelocity[1])),
    uFadeEnd: uniform(1e6 + 1),
    uFadeStart: uniform(1e6),
    uGroundAdoptHeight: uniform(settings.groundAdoptHeight),
    uGroundAdoptStrength: uniform(settings.groundAdoptStrength),
    uGroundAdoptTint: uniform(new THREE.Color(...settings.groundAdoptTint)),
    uGustFrequency: uniform(settings.gustFrequency),
    uGustResponse: uniform(settings.gustResponse),
    uGustSpeed: uniform(settings.gustSpeed),
    uPushPosition: uniform(new THREE.Vector3(0, -1e5, 0)),
    uPushRadius: uniform(settings.pushRadius),
    uShadowStrength: uniform(settings.shadowStrength),
    uShadowTint: uniform(new THREE.Color()),
    uSkyColor: uniform(new THREE.Color()),
    uSunColor: uniform(new THREE.Color()),
    uSunDirection: uniform(new THREE.Vector3(...settings.sunDirection).normalize()),
    uTime: uniform(0),
    uTipColor: uniform(new THREE.Color()),
    uStaticLean: uniform(settings.leanStrength),
    uWindDirection: uniform(new THREE.Vector2(settings.windDirection[0], settings.windDirection[1])),
    uWindResponse: uniform(settings.windResponse),
    uWindSpeed: uniform(settings.windSpeed),
    uWindStrength: uniform(settings.windStrength),
    uWashLift: uniform(settings.washLift),
    uWashOpacity: uniform(settings.washOpacity),
    ...styleUniforms,
  };
  if (!vegetationShader) u.uStyleGrassBacklitStrength.value = settings.backlitStrength;
  // Compatibility alias: legacy runtime setters now target the canonical style node.
  u.uBacklitStrength = u.uStyleGrassBacklitStrength;

  const material = new NodeMaterial();
  material.name = 'StylizedGrass';
  material.side = THREE.DoubleSide;
  material.fog = true;
  material.transparent = settings.washOpacity < 0.999;
  material.depthWrite = true;

  const vUv = uv();
  const vJitter = varying(float(), 'vGrassJitter');
  const vGust = varying(float(), 'vGrassGust');
  const vNormal = varying(vec3(), 'vGrassNormal');
  const vWorldPosition = varying(vec3(), 'vGrassWorldPosition');
  const vGroundColor = varying(vec4(), 'vGrassGroundColor');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = clumpGeometry
      ? attribute('iClump', 'vec4')
      : attribute('iInfo', 'vec4');
    const bladeOrigin = clumpGeometry
      ? attribute('aBladeOrigin', 'vec3')
      : vec3(0.0);
    const bladeInfo = clumpGeometry
      ? attribute('aBladeInfo', 'vec4')
      : iInfo;
    const surfaceUp = clumpGeometry
      ? normalize(attribute('iSurfaceNormal', 'vec3'))
      : vec3(0.0, 1.0, 0.0);
    const surfaceForward = clumpGeometry
      ? normalize(attribute('iSurfaceForward', 'vec3'))
      : vec3(1.0, 0.0, 0.0);
    const clumpScale = clumpGeometry ? iInfo.x : float(1.0);
    const bladeHeight = clumpGeometry ? bladeInfo.x.mul(clumpScale) : iInfo.x;
    const bladeWidth = clumpGeometry ? bladeInfo.y.mul(clumpScale) : iInfo.z;
    const bladePhase = clumpGeometry
      ? fract(iInfo.y.add(bladeInfo.z))
      : iInfo.y;
    const facingAngle = clumpGeometry
      ? iInfo.z.add(bladeInfo.w)
      : iInfo.w;

    vJitter.assign(fract(bladePhase.mul(13.73)));
    const heightFraction = vUv.y;
    const facing = vec2(cos(facingAngle), sin(facingAngle)).toVar();
    const windDirection = normalize(u.uWindDirection.add(vec2(1e-4, 0.0))).toVar();

    const rootPosition = vec3(iOrigin).toVar();
    const bladePosition = vec3(rootPosition).toVar();
    if (clumpGeometry) {
      const clumpForward = vec3(surfaceForward).toVar();
      const clumpRight = normalize(cross(clumpForward, surfaceUp)).toVar();
      rootPosition.addAssign(
        clumpForward.mul(bladeOrigin.x)
          .add(clumpRight.mul(bladeOrigin.z))
          .mul(clumpScale),
      );
      bladePosition.assign(rootPosition);
      const bladeFacing = clumpForward.mul(cos(bladeInfo.w))
        .add(clumpRight.mul(sin(bladeInfo.w)));
      bladePosition.addAssign(bladeFacing.mul(positionLocal.x.mul(bladeWidth)));
      bladePosition.addAssign(surfaceUp.mul(heightFraction.mul(bladeHeight)));
      facing.assign(normalize(bladeFacing.xz.add(vec2(1e-4, 0.0))));
    } else {
      bladePosition.xz.addAssign(facing.mul(positionLocal.x.mul(bladeWidth)));
      bladePosition.y.addAssign(heightFraction.mul(bladeHeight));
    }

    const bendCurve = pow(heightFraction, u.uStyleGrassBendExponent).toVar();

    // Static per-blade lean (see grass.vert.glsl).
    const bowDirection = vec2(facing.y.negate(), facing.x);
    const leanDirection = normalize(
      bowDirection.mul(vJitter.sub(0.5))
        .add(facing.mul(fract(bladePhase.mul(7.31)).sub(0.5)))
        .add(vec2(1e-4, 0.0)),
    ).toVar();
    const leanAmount = fract(bladePhase.mul(3.17)).mul(0.5).add(0.18)
      .mul(u.uStaticLean).toVar();
    bladePosition.xz.addAssign(leanDirection.mul(leanAmount).mul(bendCurve).mul(bladeHeight));
    bladePosition.y.subAssign(leanAmount.mul(leanAmount).mul(0.4).mul(bendCurve).mul(bladeHeight));

    // Traveling gust wave.
    const gustPhase = dot(rootPosition.xz, windDirection).mul(u.uGustFrequency)
      .sub(u.uTime.mul(u.uGustSpeed));
    const gust = sin(gustPhase).mul(0.5)
      .add(sin(gustPhase.mul(0.43).add(1.7)).mul(0.3))
      .add(sin(gustPhase.mul(2.3).add(bladePhase.mul(4.0))).mul(0.2));
    vGust.assign(clamp(gust.mul(0.5).add(0.5), 0.0, 1.0));

    const phase = u.uTime.mul(u.uWindSpeed).add(bladePhase.mul(6.2831))
      .add(dot(rootPosition.xz, vec2(0.35, 0.28)));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const wind = windDirection.mul(
      flutter.mul(0.6).add(vGust.mul(1.1).mul(u.uGustResponse)),
    ).toVar();
    const windAmplitude = u.uWindStrength.mul(u.uWindResponse).toVar();
    bladePosition.xz.addAssign(wind.mul(windAmplitude).mul(bendCurve).mul(bladeHeight));

    // Character push.
    const fromPush = bladePosition.xz.sub(u.uPushPosition.xz).toVar();
    const pushDistance = length(fromPush);
    const push = smoothstep(0.0, u.uPushRadius, pushDistance).oneMinus()
      .mul(step(abs(rootPosition.y.sub(u.uPushPosition.y)), 1.8));
    bladePosition.xz.addAssign(
      normalize(fromPush.add(vec2(1e-4, 0.0))).mul(push).mul(0.42)
        .mul(bendCurve).mul(bladeHeight).mul(u.uStyleGrassInteractionResponse),
    );
    bladePosition.y.subAssign(
      push.mul(0.14).mul(bendCurve).mul(bladeHeight).mul(u.uStyleGrassInteractionResponse),
    );

    // Shared field normal, tilted by the current bend.
    const tilt = wind.mul(windAmplitude).add(leanDirection.mul(leanAmount).mul(0.35)).mul(heightFraction);
    vNormal.assign(normalize(
      surfaceUp.add(vec3(tilt.x.mul(1.4), 0.0, tilt.y.mul(1.4))),
    ));

    // Distance fade to a degenerate point.
    const originWorld = modelWorldMatrix.mul(vec4(rootPosition, 1.0)).toVar();
    const fadeDistance = distance(originWorld.xz, cameraPosition.xz);
    const fade = smoothstep(u.uFadeStart, u.uFadeEnd, fadeDistance).oneMinus();
    bladePosition.assign(mix(rootPosition, bladePosition, fade));

    // Ground-field adoption: one sample per vertex at the blade ROOT, so the
    // whole blade carries the color of the terrain it grows from (the
    // reference pack's RVT-colored grass). Alpha is field coverage — 0 off
    // the terrain or before the pass runs, leaving the palette untouched.
    // Small isolated lab previews do not run the landscape ground-field pass.
    // Omitting the texture nodes entirely in that case avoids compiling an
    // unused textureDimensions binding on WebGPU.
    vGroundColor.assign(
      groundField ? sampleGroundColor(originWorld.xyz) : vec4(0.0),
    );

    const worldPosition = modelWorldMatrix.mul(vec4(bladePosition, 1.0));
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    if (!clumpGeometry) {
      // The legacy single-blade geometry is a rectangle, so trim it into a
      // rounded taper. Clump geometry carries a real five-triangle tapered
      // silhouette and does not pay this discarded-fragment cost.
      const taper = pow(vUv.y, 1.6).mul(0.96).oneMinus();
      const halfWidth = taper.mul(0.5);
      Discard(abs(vUv.x.sub(0.5)).greaterThan(halfWidth));
    }

    const tipMix = smoothstep(
      u.uStyleGrassTipGradientStart,
      u.uStyleGrassTipGradientEnd,
      vUv.y.mul(vJitter.mul(0.3).add(0.85)),
    ).toVar();
    const sourceColor = mix(u.uBaseColor, u.uTipColor, tipMix).toVar();
    const styleTipRaw = u.uStyleGrassBaseColor.add(u.uStyleGrassTipBrightness);
    const styleTipLuminance = dot(styleTipRaw, vec3(0.3, 0.59, 0.11));
    const styleTip = shiftNormalizedHue(
      mix(styleTipRaw, vec3(styleTipLuminance), u.uStyleGrassTipDesaturation),
      u.uStyleGrassTipHueShift,
    );
    const styleColor = mix(u.uStyleGrassBaseColor, styleTip, tipMix);
    const color = mix(
      sourceColor,
      styleColor,
      u.uStyleGrassStyleColorStrength,
    ).toVar();
    // Ground adoption follows MI_Grass rather than simply tinting the roots:
    // the sampled landscape albedo becomes the blade's root palette and the
    // lighter/saturated tip is derived from that same albedo. This keeps the
    // entire silhouette coherent with grass, dirt, and path colors beneath
    // it instead of revealing a bright authored tip over a terrain-colored
    // root. uGroundAdoptHeight controls how long the exact ground color is
    // retained before the ground-derived tip treatment takes over.
    If(u.uGroundAdoptStrength.greaterThan(0.0), () => {
      const groundRoot = vGroundColor.rgb.mul(u.uGroundAdoptTint).toVar();
      // Brighten multiplicatively so a green ground remains green. Additive
      // RGB lift desaturates and can rotate green toward yellow at the tips.
      const groundTipScale = clamp(
        u.uStyleGrassTipBrightness.mul(0.9).add(1.0), 0.1, 2.0,
      );
      const groundTipRaw = groundRoot.mul(groundTipScale);
      const groundTipLuminance = dot(groundTipRaw, vec3(0.3, 0.59, 0.11));
      const groundTip = shiftNormalizedHue(
        mix(groundTipRaw, vec3(groundTipLuminance), u.uStyleGrassTipDesaturation),
        u.uStyleGrassTipHueShift,
      );
      const groundDriven = mix(groundRoot, groundTip, tipMix).toVar();
      const exactGround = smoothstep(u.uGroundAdoptHeight, 0.0, vUv.y);
      groundDriven.assign(mix(groundDriven, groundRoot, exactGround));
      const adopt = clamp(u.uGroundAdoptStrength.mul(vGroundColor.a), 0.0, 1.0);
      color.assign(mix(color, groundDriven, adopt));
    });
    color.mulAssign(vJitter.sub(0.5).mul(u.uStyleGrassColorVariationStrength).add(1.0));

    // Dense-field AO toward the roots.
    color.mulAssign(mix(
      u.uStyleGrassRootOcclusionStrength.oneMinus(),
      1.0,
      smoothstep(0.0, u.uStyleGrassRootOcclusionHeight, vUv.y),
    ));

    const normal = normalize(vNormal);
    const sunDirection = normalize(u.uSunDirection);
    const proceduralCloudShadow = stylizedCloudShadow(
      vWorldPosition.xz, u.uTime,
      u.uCloudShadowStrength, u.uCloudShadowCoverage, u.uCloudShadowScale, u.uCloudShadowVelocity,
    );
    const cloudShadow = sampleEnvironmentCloudShadow(
      vWorldPosition,
      proceduralCloudShadow,
    ).toVar();
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uShadowStrength);
    const shaded = shadeVegetationSurface({
      baseColor: color,
      bandSoftness: u.uStyleGrassBandSoftness,
      bandThreshold: u.uStyleGrassBandThreshold,
      cloudShadow,
      cloudShadowResponse: u.uStyleGrassCloudShadowResponse,
      materialShadowColor: u.uShadowTint,
      normal,
      sceneShadow,
      sceneShadowResponse: u.uStyleGrassSceneShadowResponse,
      shadowFloor: u.uStyleGrassShadowFloor,
      skyColor: u.uSkyColor,
      sunColor: u.uSunColor,
      sunDirection,
      transmissionMultiplier: u.uStyleGrassBacklitStrength.div(0.35).mul(tipMix),
      u,
      worldPosition: vWorldPosition,
    });

    const groundCoverage = clamp(
      u.uGroundAdoptStrength.mul(vGroundColor.a), 0.0, 1.0,
    );
    // The field now contains the ground's visible sun/sky/shared-shadow
    // result. Do not light the adopted part a second time: that would make
    // grass ignore or exaggerate the cast-shadow color beneath it.
    shaded.color.assign(mix(shaded.color, color, groundCoverage));

    const sheen = smoothstep(u.uStyleGrassGustSheenThreshold, 1.0, vGust).mul(tipMix);
    shaded.color.addAssign(
      u.uSunColor.mul(sheen).mul(u.uStyleGrassGustSheenStrength).mul(shaded.band)
        .mul(u.uSunIntensity),
    );
    const viewDirection = normalize(cameraPosition.sub(vWorldPosition));
    const halfVector = normalize(sunDirection.add(viewDirection));
    const highlightPower = mix(96.0, 8.0, u.uStyleGrassRoughness);
    const highlight = pow(
      clamp(dot(normal, halfVector), 0, 1),
      highlightPower,
    ).mul(sceneShadow).mul(u.uStyleGrassSpecularStrength).mul(u.uSunIntensity);
    shaded.color.addAssign(u.uSunColor.mul(highlight));
    shaded.color.addAssign(color.mul(u.uStyleGrassEmissiveStrength));

    // Texture-free watercolor layering. Two low-frequency bands create
    // irregular pigment lift along each stroke; seeded opacity lets dense
    // clumps read as overlapping painted blades instead of one opaque cutout.
    // Neutral defaults leave other grass presets unchanged.
    const washBand = sin(
      vUv.y.mul(10.7)
        .add(vJitter.mul(6.2831))
        .add(dot(vWorldPosition.xz, vec2(0.73, 0.41))),
    ).mul(0.5).add(0.5);
    const washGrain = sin(
      vUv.y.mul(23.1)
        .sub(vJitter.mul(4.7))
        .add(dot(vWorldPosition.xz, vec2(-0.29, 0.83))),
    ).mul(0.5).add(0.5);
    const wash = washBand.mul(0.65).add(washGrain.mul(0.35));
    // Watercolor lift layers over the lit, ground-adopted blade. Returning to
    // flat ground albedo here would undo the shared scene-light response a
    // second time.
    const washTarget = shaded.color.mul(1.18).add(
      u.uSunColor.mul(0.035).mul(groundCoverage.oneMinus()).mul(u.uSunIntensity),
    );
    shaded.color.assign(mix(shaded.color, washTarget, u.uWashLift));
    const strokeAlpha = mix(
      u.uWashOpacity.mul(0.86),
      u.uWashOpacity,
      wash.mul(0.65).add(vJitter.mul(0.35)),
    );

    return vec4(shaded.color, strokeAlpha);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, 'grassBlade', 'procedural');
}
