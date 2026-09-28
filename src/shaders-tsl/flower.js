// TSL port of src/shaders/flower.vert.glsl + flower.frag.glsl — procedural
// daisy heads riding the grass canopy as camera-facing billboards. Also home
// to the tree lab's flower-patch materials (textured species heads + toon
// stems), so every flower path renders through node materials.

import * as THREE from 'three';
import {
  abs,
  atan,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  Discard,
  dot,
  float,
  Fn,
  instanceIndex,
  length,
  floor,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  normalWorld,
  normalWorldGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  varying,
  vertexColor,
  vec2,
  vec3,
  vec4,
  attribute,
} from 'three/tsl';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import {
  createVegetationStyleUniforms,
  shadeVegetationSurface,
  tagVegetationRole,
} from './chunks/vegetation-style.js';

const FLOWER_HEAD_ROLES = Object.freeze(['flowerPetal', 'flowerCenter']);

function flowerSurfaceUniforms(vegetationShader, role = FLOWER_HEAD_ROLES) {
  const style = createVegetationStyleUniforms(vegetationShader, role);
  return {
    uCloudShadowCoverage: uniform(0.45),
    uCloudShadowScale: uniform(0.012),
    uCloudShadowStrength: uniform(0),
    uCloudShadowVelocity: uniform(new THREE.Vector2(0.02, 0.006)),
    uSkyColor: uniform(new THREE.Color().setRGB(0.62, 0.78, 0.95, THREE.SRGBColorSpace)),
    uSunColor: uniform(new THREE.Color().setRGB(1, 0.96, 0.84, THREE.SRGBColorSpace)),
    uSunDirection: uniform(new THREE.Vector3(0.35, 0.72, 0.42).normalize()),
    ...style,
  };
}

function resolveFlowerCenterRadius(map, centerRadius) {
  const value = centerRadius
    ?? map?.userData?.toonlabFlower?.centerRadius
    ?? map?.userData?.toonlabFlowerCenterRadius
    ?? 0;
  return THREE.MathUtils.clamp(Number(value) || 0, 0, 0.5);
}

function flowerCloudShadow(u, worldPosition) {
  const proceduralCloudShadow = stylizedCloudShadow(
    worldPosition.xz,
    time,
    u.uCloudShadowStrength,
    u.uCloudShadowCoverage,
    u.uCloudShadowScale,
    u.uCloudShadowVelocity,
  );
  return sampleEnvironmentCloudShadow(worldPosition, proceduralCloudShadow);
}

function aliasLegacyFlowerUniforms(u) {
  // The old one-field Flower shader remains a compatibility adapter, but all
  // petal variants now share the same underlying style uniform.
  u.uUnlitLift = u.uStyleFlowerUnlitPetalLift;
  return u;
}

function shadeFlowerHead({
  centerBaseColor,
  centerMask,
  normal,
  petalBaseColor,
  sceneShadow,
  u,
  worldPosition,
}) {
  const cloudShadow = flowerCloudShadow(u, worldPosition);
  const flowerTint = mix(
    vec3(1),
    u.uStyleFlowerTextureTint,
    u.uStyleFlowerTintStrength,
  );
  const styledPetalColor = petalBaseColor.mul(flowerTint);
  const styledCenterColor = centerBaseColor.mul(flowerTint);
  // Shadow-side lift is reflected light, distinct from authored emission.
  const sceneFill = clamp(u.uSunIntensity.add(u.uSkyIntensity).mul(0.5), 0, 1.5);
  const petal = shadeVegetationSurface({
    baseColor: styledPetalColor,
    bandSoftness: u.uStyleFlowerBandSoftness,
    bandThreshold: u.uStyleFlowerBandThreshold,
    cloudShadow,
    cloudShadowResponse: 1,
    normal,
    sceneShadow,
    sceneShadowResponse: u.uStyleFlowerSceneShadowResponse,
    shadowFloor: u.uStyleThinSurfaceTransmissionShadowFloor,
    skyColor: u.uSkyColor,
    sunColor: u.uSunColor,
    sunDirection: u.uSunDirection,
    transmissionMultiplier: u.uStyleFlowerBacklitStrength.div(0.35)
      .mul(u.uStyleFlowerPetalTransmissionMultiplier)
      .mul(u.uStyleFlowerSubsurfaceStrength)
      .mul(u.uStyleFlowerSubsurfaceOpacity.oneMinus().mul(0.5).add(0.5)),
    u,
    worldPosition,
  });
  petal.color.addAssign(
    styledPetalColor.mul(petal.band.oneMinus()).mul(u.uStyleFlowerUnlitPetalLift)
      .mul(sceneFill),
  );

  // Centers are opaque botanical structures, not thin petals. They share the
  // IP lighting/weather and flower band treatment, but explicitly opt out of
  // diffuse-wrap, two-sided, normal-bias, and transmission profile controls.
  const centerSceneShadow = mix(1.0, sceneShadow, u.uStyleFlowerCenterShadowResponse);
  const center = shadeVegetationSurface({
    baseColor: styledCenterColor,
    bandSoftness: u.uStyleFlowerBandSoftness,
    bandThreshold: u.uStyleFlowerBandThreshold,
    cloudShadow,
    cloudShadowResponse: 1,
    diffuseWrap: float(0.5),
    normal,
    normalUpBias: float(0),
    sceneShadow: centerSceneShadow,
    sceneShadowResponse: u.uStyleFlowerSceneShadowResponse,
    shadowFloor: float(0.35),
    skyColor: u.uSkyColor,
    sunColor: u.uSunColor,
    sunDirection: u.uSunDirection,
    transmissionPower: float(3.5),
    transmissionShadowFloor: float(0.35),
    transmissionStrength: float(0),
    twoSidedLighting: float(0),
    u,
    worldPosition,
  });
  const centerColor = mix(
    styledCenterColor.mul(sceneFill),
    center.color,
    u.uStyleFlowerCenterLightResponse,
  );
  const result = mix(petal.color, centerColor, centerMask).toVar();
  const viewDirection = normalize(cameraPosition.sub(worldPosition));
  const halfVector = normalize(normalize(u.uSunDirection).add(viewDirection));
  const highlightPower = mix(96.0, 8.0, u.uStyleFlowerRoughness);
  const highlight = pow(
    clamp(dot(normal, halfVector), 0, 1),
    highlightPower,
  ).mul(sceneShadow).mul(u.uStyleFlowerSpecularStrength).mul(u.uSunIntensity);
  result.addAssign(u.uSunColor.mul(highlight));
  result.addAssign(
    mix(styledPetalColor, styledCenterColor, centerMask)
      .mul(u.uStyleFlowerEmissiveStrength),
  );
  return result;
}

// Textured head variants carry petal and center pixels in one draw call. The
// sprite texture publishes its semantic center radius (see flowerSpecies.js),
// so the shader does not guess from color and recoloring cannot change roles.
function shadeFlowerSprite({ normal, sceneShadow, sprite, surfaceUv, u, worldPosition }) {
  const radius = length(surfaceUv.sub(vec2(0.5, 0.5))).toVar();
  const centerFeather = u.uCenterRadius.mul(0.12).max(0.006);
  const centerMask = smoothstep(
    u.uCenterRadius.add(centerFeather),
    u.uCenterRadius.sub(centerFeather),
    radius,
  ).mul(step(0.001, u.uCenterRadius)).toVar();
  const petalEdge = clamp(radius.mul(2), 0, 1).mul(centerMask.oneMinus());
  const petalBaseColor = sprite.rgb.mul(
    petalEdge.mul(u.uStyleFlowerCupDarkeningStrength).mul(0.8).oneMinus(),
  ).toVar();
  return shadeFlowerHead({
    centerBaseColor: sprite.rgb,
    centerMask,
    normal,
    petalBaseColor,
    sceneShadow,
    u,
    worldPosition,
  });
}

export function createFlowerNodeMaterial(settings, vegetationShader = null) {
  const u = aliasLegacyFlowerUniforms({
    uCenterColor: uniform(new THREE.Color()),
    uPetalColor: uniform(new THREE.Color()),
    uShadowStrength: uniform(settings.shadowStrength),
    uTime: uniform(0),
    uWindDirection: uniform(new THREE.Vector2(settings.windDirection[0], settings.windDirection[1])),
    uWindSpeed: uniform(settings.windSpeed),
    uWindStrength: uniform(settings.windStrength),
    ...flowerSurfaceUniforms(vegetationShader),
  });

  const material = new NodeMaterial();
  material.name = 'StylizedFlowers';
  material.side = THREE.DoubleSide;
  material.fog = true;

  const vPetal = varying(vec2(), 'vFlowerPetal');
  const vPhase = varying(float(), 'vFlowerPhase');
  const vWorldNormal = varying(vec3(), 'vFlowerWorldNormal');
  const vWorldPosition = varying(vec3(), 'vFlowerWorldPosition');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = attribute('iInfo', 'vec4');

    vPetal.assign(positionLocal.xy.mul(2.0));
    vPhase.assign(iInfo.y);

    const windDirection = normalize(u.uWindDirection.add(vec2(1e-4, 0.0)));
    const phase = u.uTime.mul(u.uWindSpeed).add(iInfo.y.mul(6.2831))
      .add(dot(iOrigin.xz, vec2(0.35, 0.28)));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const sway = windDirection.mul(flutter).mul(u.uWindStrength).mul(0.55).mul(iInfo.z);

    const center = iOrigin.add(vec3(sway.x, iInfo.z, sway.y));
    // viewMatrix rows 0/1 = camera right/up (GLSL viewMatrix[c][r] indexing).
    const cameraRight = vec3(
      cameraViewMatrix.element(0).x,
      cameraViewMatrix.element(1).x,
      cameraViewMatrix.element(2).x,
    );
    const cameraUp = vec3(
      cameraViewMatrix.element(0).y,
      cameraViewMatrix.element(1).y,
      cameraViewMatrix.element(2).y,
    );
    vWorldNormal.assign(normalize(
      vec3(0, 1, 0)
        .add(cameraRight.mul(positionLocal.x).mul(0.3))
        .add(cameraUp.mul(positionLocal.y).mul(0.3)),
    ));
    const flowerPosition = center.add(
      cameraRight.mul(positionLocal.x).add(cameraUp.mul(positionLocal.y)).mul(iInfo.x),
    );

    const worldPosition = modelWorldMatrix.mul(vec4(flowerPosition, 1.0));
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    const radius = length(vPetal);
    const angle = atan(vPetal.y, vPetal.x);
    // Eight wide petals with narrow notches between them.
    const petalEdge = pow(abs(cos(angle.mul(4.0).add(vPhase.mul(6.2831)))), 0.35)
      .mul(0.58).add(0.42);
    Discard(radius.greaterThan(petalEdge));

    const centerMask = smoothstep(0.34, 0.2, radius);
    // Petals cup slightly: darken toward their outer edge.
    const petalBaseColor = u.uPetalColor.mul(
      radius.div(petalEdge).mul(u.uStyleFlowerCupDarkeningStrength).oneMinus(),
    );

    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uShadowStrength);
    const color = shadeFlowerHead({
      centerBaseColor: u.uCenterColor,
      centerMask,
      normal: normalize(vWorldNormal),
      petalBaseColor,
      sceneShadow,
      u,
      worldPosition: vWorldPosition,
    });

    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, FLOWER_HEAD_ROLES, 'procedural');
}

// Shared instance-phased sway for the tree lab's flower patch. Heads use the
// full amplitude; stems scale it by height fraction so a head stays glued to
// its stem tip (head and stem instances share the same index order, so the
// phases line up).
function flowerSway(u) {
  const phase = time.mul(u.uWindSpeed).add(float(instanceIndex).mul(1.618));
  return vec3(sin(phase), 0.0, cos(phase.mul(0.7)).mul(0.5)).mul(u.uWindStrength);
}

/**
 * Unlit cutout material for textured flower heads (species sprites drawn on
 * a canvas, including hand-drawn petals). TSL replacement for the flower
 * patch's old MeshBasicMaterial billboards, plus a gentle wind bob the
 * classic material never had.
 */
export function createFlowerHeadNodeMaterial({
  map, alphaCutoff = 0.4, centerRadius = null, vegetationShader = null,
  windSpeed = 1, windStrength = 0,
} = {}) {
  const u = aliasLegacyFlowerUniforms({
    uAlphaCutoff: uniform(alphaCutoff),
    uCenterRadius: uniform(resolveFlowerCenterRadius(map, centerRadius)),
    uMap: texture(map),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
    ...flowerSurfaceUniforms(vegetationShader),
  });

  const material = new MeshBasicNodeMaterial();
  material.name = 'FlowerPatchHead';
  material.side = THREE.DoubleSide;
  material.transparent = true;

  material.positionNode = positionLocal.add(flowerSway(u));
  material.colorNode = Fn(() => {
    // Evaluated first, at fragment scope (see the bloom material).
    const surfaceNormal = normalize(normalWorldGeometry).toVar();
    const sprite = u.uMap.sample(uv());
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(positionWorld), 0.85);
    const color = shadeFlowerSprite({
      // Raw geometric normal: shadeVegetationSurface applies the face
      // direction itself (twoSidedLighting). three's normalWorld is already
      // flipped on DoubleSide materials, and flipping twice undid it.
      normal: surfaceNormal,
      sceneShadow,
      sprite,
      surfaceUv: uv(),
      u,
      worldPosition: positionWorld,
    });
    return vec4(color, sprite.a);
  })();
  material.alphaTestNode = u.uAlphaCutoff;

  material.uniforms = u;
  return tagVegetationRole(material, FLOWER_HEAD_ROLES, 'cutout');
}

/**
 * Camera-facing textured bloom material for StylizedFlower plants: instanced
 * billboard quads (iOrigin vec3 + iInfo vec4 = size / roll / sway amplitude)
 * sampling a species head sprite, with the daisy field's wind bob. A bloom
 * never renders edge-on, from any camera.
 */
export function createFlowerHeadBillboardNodeMaterial({
  map, alphaCutoff = 0.4, centerRadius = null, vegetationShader = null,
  windDirection = [1, 0.3], windSpeed = 1, windStrength = 0,
} = {}) {
  const u = aliasLegacyFlowerUniforms({
    uAlphaCutoff: uniform(alphaCutoff),
    uCenterRadius: uniform(resolveFlowerCenterRadius(map, centerRadius)),
    uMap: texture(map),
    uWindDirection: uniform(new THREE.Vector2(windDirection[0], windDirection[1])),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
    ...flowerSurfaceUniforms(vegetationShader),
  });

  const material = new NodeMaterial();
  material.name = 'StylizedFlowerHeads';
  material.side = THREE.DoubleSide;

  const vUv = varying(vec2(), 'vFlowerHeadUv');
  const vWorldNormal = varying(vec3(), 'vFlowerHeadNormal');
  const vWorldPosition = varying(vec3(), 'vFlowerHeadWorldPosition');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = attribute('iInfo', 'vec4');
    vUv.assign(uv());

    const windDir = normalize(u.uWindDirection.add(vec2(1e-4, 0.0)));
    const phase = time.mul(u.uWindSpeed).add(iInfo.y.mul(6.2831));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const sway = windDir.mul(flutter).mul(u.uWindStrength).mul(iInfo.z);
    const center = iOrigin.add(vec3(sway.x, 0.0, sway.y));

    // Static per-head roll so repeated petal sprites don't align.
    const roll = iInfo.y.mul(6.2831);
    const rollCos = cos(roll);
    const rollSin = sin(roll);
    const corner = vec2(
      positionLocal.x.mul(rollCos).sub(positionLocal.y.mul(rollSin)),
      positionLocal.x.mul(rollSin).add(positionLocal.y.mul(rollCos)),
    );

    // viewMatrix rows 0/1 = camera right/up (GLSL viewMatrix[c][r] indexing).
    const cameraRight = vec3(
      cameraViewMatrix.element(0).x,
      cameraViewMatrix.element(1).x,
      cameraViewMatrix.element(2).x,
    );
    const cameraUp = vec3(
      cameraViewMatrix.element(0).y,
      cameraViewMatrix.element(1).y,
      cameraViewMatrix.element(2).y,
    );
    vWorldNormal.assign(normalize(cameraUp.mul(0.65).add(vec3(0, 1, 0).mul(0.35))));
    const headPosition = center.add(
      cameraRight.mul(corner.x).add(cameraUp.mul(corner.y)).mul(iInfo.x),
    );
    const worldPosition = modelWorldMatrix.mul(vec4(headPosition, 1.0));
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    const sprite = u.uMap.sample(vUv).toVar();
    Discard(sprite.a.lessThan(u.uAlphaCutoff));
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), 0.85);
    const color = shadeFlowerSprite({
      normal: normalize(vWorldNormal),
      sceneShadow,
      sprite,
      surfaceUv: vUv,
      u,
      worldPosition: vWorldPosition,
    });
    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, FLOWER_HEAD_ROLES, 'billboard');
}

/**
 * Toon material for 3D bloom-head meshes (vertex-colored petals + center
 * from createFlowerHeadGeometry), with the shared instance-phased wind bob.
 */
export function createFlowerBloomNodeMaterial({
  unlitLift = 0.35, vegetationShader = null, windSpeed = 1, windStrength = 0,
} = {}) {
  const u = aliasLegacyFlowerUniforms({
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
    ...flowerSurfaceUniforms(vegetationShader),
  });
  if (!vegetationShader) u.uStyleFlowerUnlitPetalLift.value = unlitLift;

  const material = new NodeMaterial();
  material.name = 'StylizedFlowerBloom';
  material.side = THREE.DoubleSide;
  material.positionNode = positionLocal.add(flowerSway(u));
  material.fragmentNode = Fn(() => {
    // Evaluated first, at fragment scope: first created inside the shading
    // helper's nested scope, the shared geometry-normal var reads garbage.
    const surfaceNormal = normalize(normalWorldGeometry).toVar();
    const centerMask = attribute('flowerRole', 'float');
    const petalEdge = abs(uv().x.sub(0.5)).mul(2).mul(centerMask.oneMinus());
    const rawColor = vertexColor().rgb;
    const petalBaseColor = rawColor.mul(
      petalEdge.mul(u.uStyleFlowerCupDarkeningStrength).mul(0.8).oneMinus(),
    );
    const sceneShadow = sampleEnvironmentSunShadow(positionWorld);
    const color = shadeFlowerHead({
      centerBaseColor: rawColor,
      centerMask,
      // Raw geometric normal: shadeVegetationSurface applies the face
      // direction itself (twoSidedLighting). three's normalWorld is already
      // flipped on DoubleSide materials, and flipping twice undid it.
      normal: surfaceNormal,
      petalBaseColor,
      sceneShadow,
      u,
      worldPosition: positionWorld,
    });
    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, FLOWER_HEAD_ROLES, 'mesh');
}

/**
 * Toon stem material for ground flowers. Bends with the same sway as the
 * head, scaled by height fraction (root stays planted, tip follows the head).
 */
export function createFlowerStemNodeMaterial({
  color = 0x4d8a3f, height = 1, vegetationShader = null, windSpeed = 1, windStrength = 0,
} = {}) {
  const u = {
    uBaseColor: uniform(new THREE.Color(color)),
    uHeight: uniform(Math.max(height, 1e-3)),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
    ...flowerSurfaceUniforms(vegetationShader, 'herbaceousStem'),
  };

  const material = new NodeMaterial();
  material.name = 'FlowerPatchStem';

  const bend = clamp(positionLocal.y.div(u.uHeight), 0.0, 1.0);
  material.positionNode = positionLocal.add(flowerSway(u).mul(bend));
  material.fragmentNode = Fn(() => {
    const normal = normalize(normalWorld);
    const sunDirection = normalize(u.uSunDirection);
    const wrap = dot(normal, sunDirection).mul(0.5).add(0.5);
    const steps = max(floor(u.uStyleStemBandCount), 2.0);
    const intervals = max(steps.sub(1.0), 1.0);
    const stepped = floor(clamp(wrap, 0, 1).mul(intervals).add(1e-4)).div(intervals);
    const band = mix(stepped, wrap, u.uStyleStemBandSoftness);
    const stemColor = mix(
      u.uBaseColor,
      u.uStyleStemColor,
      u.uStyleStemColorStrength,
    );
    const shaded = shadeVegetationSurface({
      bandOverride: band,
      baseColor: stemColor,
      bandSoftness: u.uStyleStemBandSoftness,
      bandThreshold: 0.5,
      cloudShadow: flowerCloudShadow(u, positionWorld),
      cloudShadowResponse: 1,
      diffuseWrap: float(0.5),
      normal,
      normalUpBias: float(0),
      sceneShadow: sampleEnvironmentSunShadow(positionWorld),
      sceneShadowResponse: 1,
      shadowFloor: u.uStyleStemShadowFloor,
      skyColor: u.uSkyColor,
      skyFillStrength: u.uStyleLightingSkyFillStrength.add(u.uStyleStemSkyFillStrength),
      rimStrength: u.uStyleLightingRimStrength.add(u.uStyleStemRimStrength),
      sunColor: u.uSunColor,
      sunDirection,
      transmissionPower: float(3.5),
      transmissionShadowFloor: float(0.35),
      transmissionStrength: u.uStyleStemTransmissionStrength,
      twoSidedLighting: float(0),
      u,
      worldPosition: positionWorld,
    });
    const viewDirection = normalize(cameraPosition.sub(positionWorld));
    const halfVector = normalize(sunDirection.add(viewDirection));
    const highlightPower = mix(96.0, 8.0, u.uStyleStemRoughness);
    const highlight = pow(
      clamp(dot(normal, halfVector), 0, 1),
      highlightPower,
    ).mul(u.uStyleStemSpecularStrength);
    shaded.color.addAssign(u.uSunColor.mul(highlight).mul(u.uSunIntensity));
    shaded.color.addAssign(stemColor.mul(u.uStyleStemEmissiveStrength));
    return vec4(shaded.color, 1.0);
  })();

  material.uniforms = u;
  return tagVegetationRole(material, 'herbaceousStem', 'mesh');
}
