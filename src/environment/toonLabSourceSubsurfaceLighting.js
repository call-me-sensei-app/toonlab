// ToonLab legacy MSM_SUBSURFACE lighting bridge for the supplied source
// foliage. The material graphs provide literal SubsurfaceColor and Opacity;
// this module owns the renderer-specific interpretation of those two values.

import { PhysicalLightingModel } from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  getShIrradianceAt,
  max,
  mix,
  normalView,
  normalWorld,
  positionViewDirection,
  pow,
  vec3,
  wgslFn,
} from 'three/tsl';

const TOONLAB_SUBSURFACE_TRANSMITTANCE_DISTANCE_METERS = 0.15;
const TOONLAB_PARTICIPATING_MEDIA_MIN_TRANSMITTANCE = 1e-12;

export const TOONLAB_SOURCE_SUBSURFACE_LIGHTING_SOURCE = Object.freeze({
  basePass: 'Engine/Shaders/Private/BasePassPixelShader.usf',
  basePassSha256: 'ba8b1c5efd4fba2e67bdc22b16820b004102f2123b8bbaf66dff87cc2d17e1ef',
  deferredLighting: 'Engine/Shaders/Private/DeferredLightingCommon.ush',
  deferredLightingSha256:
    'd3bcd5cf9c36cab57c281f6cad447816891836e3c05a67c8808cbb9ad83e2c46',
  deferredShading: 'Engine/Shaders/Private/DeferredShadingCommon.ush',
  deferredShadingSha256:
    '589432a8fa90a6f365d3bba3b13c4387d80dd6018224abe68cd01d8aeda1c62f',
  engine: 'ToonLab legacy MSM_SUBSURFACE',
  sceneRendering: 'Engine/Source/Runtime/Renderer/Private/SceneRendering.cpp',
  sceneRenderingSha256:
    '5467b777eba023c92c4780981c70540b0d476151c3da559c6be939a9bf204647',
  shadingModels: 'Engine/Shaders/Private/ShadingModels.ush',
  shadingModelsSha256:
    '27d661854c627ad0aa52673f553946a9c61add15674b32715b4a6297d02ed98f',
});

export const TOONLAB_SOURCE_SUBSURFACE_LIGHTING_CONTRACT = Object.freeze({
  ambientOcclusion:
    'material AO defaults to one; accumulated indirect is then processed by the active renderer AO stage',
  direct:
    'DefaultLit surface + MSM_SUBSURFACE wrapped backscatter/in-scatter transmission',
  indirect:
    '(frontIrradiance * (DiffuseColor + SubsurfaceColor) + backIrradiance * SubsurfaceColor) / PI',
  normal:
    'face-corrected material normal; backface SkyLight evaluates the opposite world normal',
  opticalDistanceMeters: TOONLAB_SUBSURFACE_TRANSMITTANCE_DISTANCE_METERS,
  remainingBridges: Object.freeze([
    'ToonLab stores SurfaceShadow, TransmissionShadow, and subsurface transmittance/optical thickness in independent light-attenuation channels. Three exposes only the surface shadow map. Retained thin-card leaves use their authored SS Opacity to reconstruct a separate transmission visibility from unshadowed light radiance; geometry-thickness reconstruction remains a renderer bridge.',
    'ToonLab AOMultiBounce is a colored material/base-color response. Three applies its scalar material/screen AO after indirect accumulation unless the renderer supplies a dedicated ToonLab AO lighting-context adapter.',
    'ToonLab DefaultLit specular and its area-light integration remain Three PhysicalLightingModel equivalents; this adapter replaces only the MSM_SUBSURFACE terms whose source equations are available.',
  ]),
  source: 'ShadingModels.ush + BasePassPixelShader.usf + DeferredLightingCommon.ush',
  stage: 'partial-renderer-parity',
  transmissionShadowFallback:
    'surface-shadow visibility, except retained thin-card leaves which use authored SS Opacity to separate transmission from the opaque surface mask',
});

// Exact ColorSpace.ush HSV conversion plus the legacy MSM_SUBSURFACE
// Beer-Lambert hue shift. ToonLab interprets SubsurfaceColor as transmittance at
// r.SSS.SubSurfaceColorAsTansmittanceAtDistance (0.15 by default), evaluates
// it at one normalized meter, then restores the original HSV value channel.
const toonLabSourceSubsurfaceTransmittedColor = wgslFn(`
  fn toonLabSourceSubsurfaceTransmittedColor(
    subsurfaceColor: vec3<f32>,
    transmittanceDistanceMeters: f32
  ) -> vec3<f32> {
    let extinction = -log(clamp(
      subsurfaceColor,
      vec3<f32>(1e-12),
      vec3<f32>(1.0)
    )) / max(1e-12, transmittanceDistanceMeters);
    let rawTransmittedColor = exp(-extinction);
    let rawHsv = toonLabSourceLinearRgbToHsv(rawTransmittedColor);
    let sourceHsv = toonLabSourceLinearRgbToHsv(subsurfaceColor);
    return toonLabSourceHsvToLinearRgb(vec3<f32>(rawHsv.xy, sourceHsv.z));
  }

  fn toonLabSourceLinearRgbToHsv(rgb: vec3<f32>) -> vec3<f32> {
    let p = select(
      vec4<f32>(rgb.g, rgb.b, 0.0, -1.0 / 3.0),
      vec4<f32>(rgb.b, rgb.g, -1.0, 2.0 / 3.0),
      rgb.g < rgb.b
    );
    let q = select(
      vec4<f32>(rgb.r, p.y, p.z, p.x),
      vec4<f32>(p.x, p.y, p.w, rgb.r),
      rgb.r < p.x
    );
    let chroma = q.x - min(q.w, q.y);
    let hue = abs((q.w - q.y) / (6.0 * chroma + 1e-10) + q.z);
    return vec3<f32>(hue, chroma / (q.x + 1e-10), q.x);
  }

  fn toonLabSourceHsvToLinearRgb(hsv: vec3<f32>) -> vec3<f32> {
    let hueRgb = clamp(vec3<f32>(
      abs(hsv.x * 6.0 - 3.0) - 1.0,
      2.0 - abs(hsv.x * 6.0 - 2.0),
      2.0 - abs(hsv.x * 6.0 - 4.0)
    ), vec3<f32>(0.0), vec3<f32>(1.0));
    return ((hueRgb - vec3<f32>(1.0)) * hsv.y + vec3<f32>(1.0)) * hsv.z;
  }
`);

function finiteScalar(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function finiteColor(value, label) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length < 3) {
    throw new TypeError(`${label} must contain three numeric channels.`);
  }
  const result = Array.from(value).slice(0, 3).map(Number);
  if (!result.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain three numeric channels.`);
  }
  return result;
}

const saturateNumber = (value) => Math.min(1, Math.max(0, value));
const colorMultiply = (left, right) => left.map(
  (channel, index) => channel * right[index],
);
const colorScale = (value, scalar) => value.map((channel) => channel * scalar);
const colorAdd = (...values) => values[0].map(
  (_, channel) => values.reduce((sum, value) => sum + value[channel], 0),
);
const colorMix = (left, right, amount) => left.map(
  (channel, index) => channel * (1 - amount) + right[index] * amount,
);

function linearRgbToHsv([red, green, blue]) {
  const p = green < blue
    ? [blue, green, -1, 2 / 3]
    : [green, blue, 0, -1 / 3];
  const q = red < p[0]
    ? [p[0], p[1], p[3], red]
    : [red, p[1], p[2], p[0]];
  const chroma = q[0] - Math.min(q[3], q[1]);
  return [
    Math.abs((q[3] - q[1]) / (6 * chroma + 1e-10) + q[2]),
    chroma / (q[0] + 1e-10),
    q[0],
  ];
}

function hsvToLinearRgb([hue, saturation, value]) {
  const hueRgb = [
    Math.abs(hue * 6 - 3) - 1,
    2 - Math.abs(hue * 6 - 2),
    2 - Math.abs(hue * 6 - 4),
  ].map(saturateNumber);
  return hueRgb.map((channel) => ((channel - 1) * saturation + 1) * value);
}

/** CPU form of the ToonLab Beer-Lambert/HSV transmission-color transform. */
export function evaluateToonLabSourceSubsurfaceTransmittedColor(
  subsurfaceColor,
  transmittanceDistanceMeters = TOONLAB_SUBSURFACE_TRANSMITTANCE_DISTANCE_METERS,
) {
  const source = finiteColor(subsurfaceColor, 'subsurfaceColor').map(
    (channel) => Math.min(1, Math.max(TOONLAB_PARTICIPATING_MEDIA_MIN_TRANSMITTANCE, channel)),
  );
  const distance = Math.max(
    TOONLAB_PARTICIPATING_MEDIA_MIN_TRANSMITTANCE,
    finiteScalar(transmittanceDistanceMeters, 'transmittanceDistanceMeters'),
  );
  const raw = source.map((channel) => {
    const extinction = -Math.log(channel) / distance;
    return Math.exp(-extinction);
  });
  const rawHsv = linearRgbToHsv(raw);
  const sourceHsv = linearRgbToHsv(source);
  return Object.freeze(hsvToLinearRgb([rawHsv[0], rawHsv[1], sourceHsv[2]]));
}

/**
 * Diffuse-only CPU oracle for the ported ToonLab MSM_SUBSURFACE equations.
 * Specular is intentionally excluded because it remains the stock physical
 * bridge and is not part of the foliage hue-preservation correction.
 */
export function evaluateToonLabSourceSubsurfaceDiffuse({
  baseColor = [1, 1, 1],
  backIrradiance = [0, 0, 0],
  frontIrradiance = [0, 0, 0],
  gbufferAo = 1,
  indirectAo = [1, 1, 1],
  lightColor = [0, 0, 0],
  lightDotNegativeView = 0,
  normalDotLight = 0,
  opticalTransmittance = 1,
  opacity = 1,
  subsurfaceColor = [0, 0, 0],
  surfaceShadow = 1,
  transmissionShadow = surfaceShadow,
} = {}) {
  const base = finiteColor(baseColor, 'baseColor');
  const subsurface = finiteColor(subsurfaceColor, 'subsurfaceColor');
  const front = finiteColor(frontIrradiance, 'frontIrradiance');
  const back = finiteColor(backIrradiance, 'backIrradiance');
  const light = finiteColor(lightColor, 'lightColor');
  const ao = finiteColor(indirectAo, 'indirectAo');
  const sourceOpacity = saturateNumber(finiteScalar(opacity, 'opacity'));
  const nDotL = finiteScalar(normalDotLight, 'normalDotLight');
  const lDotNegativeV = saturateNumber(finiteScalar(
    lightDotNegativeView,
    'lightDotNegativeView',
  ));
  const surfaceVisibility = saturateNumber(finiteScalar(surfaceShadow, 'surfaceShadow'));
  const transmissionVisibility = saturateNumber(finiteScalar(
    transmissionShadow,
    'transmissionShadow',
  ));
  const optical = saturateNumber(finiteScalar(
    opticalTransmittance,
    'opticalTransmittance',
  ));
  const sourceGbufferAo = saturateNumber(finiteScalar(gbufferAo, 'gbufferAo'));

  const directSurface = colorScale(
    colorMultiply(light, base),
    surfaceVisibility * saturateNumber(nDotL) / Math.PI,
  );
  const inScatter = lDotNegativeV ** 12 * (
    3 * (1 - sourceOpacity) + 0.1 * sourceOpacity
  );
  const wrappedDiffuse = saturateNumber(nDotL / 1.5 + 0.5 / 1.5) ** 1.5
    * (2.5 / 1.5);
  const normalContribution = 1 * (1 - sourceOpacity)
    + wrappedDiffuse * sourceOpacity;
  const backScatter = sourceGbufferAo * normalContribution / (Math.PI * 2);
  const scattering = backScatter * (1 - inScatter) + inScatter;
  const transmitted = evaluateToonLabSourceSubsurfaceTransmittedColor(subsurface);
  const transmissionColor = colorMix(transmitted, subsurface, optical);
  const directTransmission = colorScale(
    colorMultiply(light, transmissionColor),
    transmissionVisibility * scattering,
  );
  const frontIndirect = colorMultiply(front, colorAdd(base, subsurface));
  const backIndirect = colorMultiply(back, subsurface);
  const indirect = colorMultiply(
    colorScale(colorAdd(frontIndirect, backIndirect), 1 / Math.PI),
    ao,
  );
  const totalDiffuse = colorAdd(directSurface, directTransmission, indirect);

  return Object.freeze({
    backScatter,
    directSurface: Object.freeze(directSurface),
    directTransmission: Object.freeze(directTransmission),
    inScatter,
    indirect: Object.freeze(indirect),
    normalContribution,
    totalDiffuse: Object.freeze(totalDiffuse),
    transmittedColor: transmitted,
    transmissionColor: Object.freeze(transmissionColor),
    wrappedDiffuse,
  });
}

function capturedSkyBackfaceIrradiance(builder) {
  let irradiance = vec3(0);
  const lightNodes = builder.lightsNode?.getLightNodes?.(builder) ?? [];
  for (const lightNode of lightNodes) {
    if (!lightNode?.lightProbe || !lightNode?.light?.userData?.toonLabSourceSkyLight) continue;
    irradiance = irradiance.add(max(
      vec3(0),
      getShIrradianceAt(normalWorld.negate(), lightNode.lightProbe),
    ));
  }
  return irradiance;
}

export class ToonLabSourceSubsurfaceLightingModel extends PhysicalLightingModel {
  constructor({
    gbufferAoNode = float(1),
    opticalTransmittanceNode = float(1),
    subsurfaceColorNode = vec3(0),
    subsurfaceOpacityNode = float(1),
    thinCardTransmissionFallback = false,
    transmissionShadowNode = null,
  } = {}) {
    super(false, false, false, false, false, false);
    this.gbufferAoNode = gbufferAoNode;
    this.opticalTransmittanceNode = opticalTransmittanceNode;
    this.subsurfaceColorNode = subsurfaceColorNode;
    this.subsurfaceOpacityNode = subsurfaceOpacityNode;
    this.thinCardTransmissionFallback = thinCardTransmissionFallback === true;
    this.transmissionShadowNode = transmissionShadowNode;
  }

  direct(input, builder) {
    // Surface diffuse/specular remains the DefaultLit physical bridge and
    // continues to consume Three's ordinary surface-shadowed light color.
    super.direct(input, builder);

    const {
      lightColor,
      lightDirection,
      lightNode,
      reflectedLight,
    } = input;
    const opacity = clamp(float(this.subsurfaceOpacityNode), 0, 1);
    const subsurfaceColor = clamp(vec3(this.subsurfaceColorNode), 0, 1);
    const inScatter = pow(
      clamp(dot(lightDirection, positionViewDirection.negate()), 0, 1),
      12,
    ).mul(mix(3, 0.1, opacity));
    const wrappedDiffuse = pow(
      clamp(dot(normalView, lightDirection).div(1.5).add(0.5 / 1.5), 0, 1),
      1.5,
    ).mul(2.5 / 1.5);
    const normalContribution = mix(1, wrappedDiffuse, opacity);
    const backScatter = clamp(float(this.gbufferAoNode), 0, 1)
      .mul(normalContribution)
      .div(Math.PI * 2);
    const scattering = mix(backScatter, 1, inScatter);
    const transmittedColor = toonLabSourceSubsurfaceTransmittedColor(
      subsurfaceColor,
      float(TOONLAB_SUBSURFACE_TRANSMITTANCE_DISTANCE_METERS),
    );
    const transmissionColor = mix(
      transmittedColor,
      subsurfaceColor,
      clamp(float(this.opticalTransmittanceNode), 0, 1),
    );

    // Three has one surface-visibility channel. If a future renderer adapter
    // supplies ToonLab's independent transmission channel, use the unshadowed light
    // radiance with that node. Otherwise reuse lightColor, which retains cast
    // shadows and cannot leak direct light through an opaque distant caster.
    let transmissionLightColor = vec3(lightColor);
    if (this.transmissionShadowNode && lightNode?.baseColorNode) {
      transmissionLightColor = vec3(lightNode.baseColorNode)
        .mul(clamp(float(this.transmissionShadowNode), 0, 1));
    } else if (this.thinCardTransmissionFallback && lightNode?.baseColorNode) {
      // ToonLab stores opaque surface visibility and subsurface transmission in
      // separate attenuation channels. Three exposes only the former to a
      // material lighting model. Reusing the binary surface value makes every
      // overlapping masked pine card read as an opaque green/black hatch.
      //
      // The retained pine is made from effectively zero-thickness cards, so
      // use the authored SS Opacity as the only source-owned coupling between
      // those channels: opacity=1 retains the opaque visibility, opacity=0
      // receives the unshadowed transmission endpoint. This preserves cast
      // shadow influence without pretending the unavailable shadow-map
      // thickness channel exists.
      const baseLightColor = vec3(lightNode.baseColorNode);
      const luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
      const surfaceVisibility = clamp(
        dot(vec3(lightColor), luminanceWeights)
          .div(max(dot(baseLightColor, luminanceWeights), 0.000001)),
        0,
        1,
      );
      const transmissionVisibility = mix(1, surfaceVisibility, opacity);
      transmissionLightColor = baseLightColor.mul(transmissionVisibility);
    }
    reflectedLight.directDiffuse.addAssign(
      transmissionLightColor.mul(scattering).mul(transmissionColor),
    );
  }

  indirectDiffuse(builder) {
    super.indirectDiffuse(builder);
    const { irradiance, reflectedLight } = builder.context;
    const subsurfaceColor = clamp(vec3(this.subsurfaceColorNode), 0, 1);
    const frontSubsurface = irradiance.mul(subsurfaceColor).mul(1 / Math.PI);
    const backSubsurface = capturedSkyBackfaceIrradiance(builder)
      .mul(subsurfaceColor)
      .mul(1 / Math.PI);
    reflectedLight.indirectDiffuse.addAssign(frontSubsurface.add(backSubsurface));
  }
}

/** Install the ToonLab MSM_SUBSURFACE lighting model on a node material. */
export function installToonLabSourceSubsurfaceLighting(material, {
  gbufferAoNode = float(1),
  opticalTransmittanceNode = float(1),
  subsurfaceColorNode = material?.thicknessColorNode ?? vec3(0),
  subsurfaceOpacityNode = material?.thicknessAttenuationNode ?? float(1),
  thinCardTransmissionFallback = false,
  transmissionShadowNode = null,
} = {}) {
  if (!material?.isNodeMaterial) return material;
  material.setupLightingModel = () => new ToonLabSourceSubsurfaceLightingModel({
    gbufferAoNode,
    opticalTransmittanceNode,
    subsurfaceColorNode,
    subsurfaceOpacityNode,
    thinCardTransmissionFallback,
    transmissionShadowNode,
  });
  material.userData.toonLabSourceSubsurfaceLighting = {
    ...TOONLAB_SOURCE_SUBSURFACE_LIGHTING_CONTRACT,
    authoredGbufferAo: 1,
    backfaceSkyLight: 'captured ToonLab SkyLight SH evaluated at -WorldNormal',
    opticalTransmittance: transmissionShadowNode
      ? 'renderer-supplied'
      : 'unshadowed receiver endpoint (1)',
    transmissionShadow: transmissionShadowNode
      ? 'renderer-supplied'
      : thinCardTransmissionFallback
        ? 'authored SS Opacity separates thin-card transmission from opaque surface visibility'
        : TOONLAB_SOURCE_SUBSURFACE_LIGHTING_CONTRACT.transmissionShadowFallback,
  };
  material.needsUpdate = true;
  return material;
}
