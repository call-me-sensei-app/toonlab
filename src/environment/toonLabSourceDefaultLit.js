// ToonLab legacy MSM_DEFAULT_LIT lighting bridge for ordinary opaque source
// materials. This module owns the renderer-side BRDF boundary; the material
// builders remain responsible for the authored BaseColor/Metallic/Specular/
// Roughness/Normal graph outputs.

import { PhysicalLightingModel } from 'three/webgpu';
import {
  DFGLUT,
  abs,
  clamp,
  diffuseColor,
  dot,
  float,
  materialRoughness,
  max,
  metalness,
  mix,
  normalView,
  normalize,
  positionViewDirection,
  pow,
  vec3,
} from 'three/tsl';

const TOONLAB_DIELECTRIC_F0_SCALE = 0.08;
const TOONLAB_DEFAULT_SPECULAR = 0.5;
const TOONLAB_NO_V_EPSILON = 1e-5;
const TOONLAB_NUMERIC_EPSILON = 1e-12;

export const TOONLAB_SOURCE_DEFAULT_LIT_SOURCE = Object.freeze({
  brdf: 'Engine/Shaders/Private/BRDF.ush',
  brdfSha256:
    '0de81cc25c9b035a77aeb0e2f1be3e730c0f117f9250fe365104f30119b5e906',
  capture: null,
  captureSha256: null,
  deferredLighting: 'Engine/Shaders/Private/DeferredLightingCommon.ush',
  deferredLightingSha256:
    'd3bcd5cf9c36cab57c281f6cad447816891836e3c05a67c8808cbb9ad83e2c46',
  projectConfig: 'StylizedExploration/Config/DefaultEngine.ini',
  projectConfigSha256:
    'db8663d1d4a41aa5a9632b68dc88ddf7dcecbe8eebd7051ad23f10a9483ceee9',
  reflectionComposite:
    'Engine/Shaders/Private/ReflectionEnvironmentComposite.ush',
  reflectionCompositeSha256:
    'cb07271acf5f83593c2481346393f78cb18ab2b9079fb10ace366a0ec04920a1',
  reflectionPixel:
    'Engine/Shaders/Private/ReflectionEnvironmentPixelShader.usf',
  reflectionPixelSha256:
    '5f22072c6d98c9701ebb472b4617fdc58e2adee4cf4f79ccb1d221643e4e4a1f',
  shadingCommon: 'Engine/Shaders/Private/ShadingCommon.ush',
  shadingCommonSha256:
    '7583ea665c6098f0957e63413971ad341dcb1588c634c7106bf955ce212c4189',
  shadingModels: 'Engine/Shaders/Private/ShadingModels.ush',
  shadingModelsSha256:
    '27d661854c627ad0aa52673f553946a9c61add15674b32715b4a6297d02ed98f',
  skyDiffuse: 'Engine/Shaders/Private/SkyLightingDiffuseShared.ush',
  skyDiffuseSha256:
    '9a725c7f015c310ed250207889f31bc9d63af8a9296e5ffa7a12b0d733d1de7c',
});

/**
 * Exactness boundary for the active ToonLabShowcase legacy Default Lit path.
 *
 * The direct BRDF is exact for the scene's zero-angle sun and zero-radius
 * point lights. The SkyLight diffuse boundary is exact once the capture node
 * supplies cosine-convolved irradiance. Reflection BRDF topology is ported,
 * but Three's DFG LUT/PMREM bytes are not ToonLab's PreIntegratedGF/reflection
 * capture buffers, and the active ToonLab SSR/AO composition is renderer-owned.
 */
export const TOONLAB_SOURCE_DEFAULT_LIT_CONTRACT = Object.freeze({
  ambientOcclusion:
    'deferred renderer stage; deliberately not folded into the material BRDF',
  directDiffuse: 'LightColor * saturate(N.L) * DiffuseColor / PI',
  directSpecular:
    'single-scatter isotropic GGX: D_GGX * Vis_SmithJointApprox * F_Schlick',
  energyConservation: false,
  indirectDiffuse:
    'cosine-convolved captured-SkyLight irradiance * DiffuseColor / PI',
  indirectSpecular:
    'filtered radiance * (F0 * AB.x + saturate(50 * F0.g) * AB.y)',
  roughDiffuse: false,
  source: 'ToonLab legacy MSM_DEFAULT_LIT; Substrate disabled',
  stage: 'partial-renderer-parity',
  punctualSourceShape: Object.freeze({
    directionalLightSourceAngle: 0,
    pointLightSourceRadius: 0,
  }),
  remainingBridges: Object.freeze([
    'ToonLab PreIntegratedGF texels are not exported; runtime uses Three DFGLUT only for the same split-sum F0/F90 boundary.',
    'Three PMREM filtering/encoding is not ToonLab reflection-capture GatherRadiance filtering/encoding.',
    'ToonLabShowcase selects screen-space reflections; ToonLab SSR tracing, hit validation, temporal denoise, and reflection fallback remain renderer work.',
    'ToonLab material/screen AO, GetSpecularOcclusion, bent-normal/distance-field occlusion, and indirect-only composition remain renderer work.',
    'Rect/finite-area lights, anisotropy, and nonzero source-angle/radius energy normalization are outside the zero-size ToonLabShowcase light scope.',
  ]),
});

const saturateNumber = (value) => Math.min(1, Math.max(0, value));

function finiteScalar(value, label) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError(`${label} must be finite.`);
  return result;
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

function finiteDirection(value, label) {
  const result = finiteColor(value, label);
  const length = Math.hypot(...result);
  if (!(length > 0)) throw new RangeError(`${label} must have nonzero length.`);
  return result.map((channel) => channel / length);
}

const frozenColor = (value) => Object.freeze([...value]);
const colorScale = (value, scalar) => value.map((channel) => channel * scalar);
const colorMultiply = (left, right) => left.map(
  (channel, index) => channel * right[index],
);
const colorAdd = (left, right) => left.map(
  (channel, index) => channel + right[index],
);
const dot3 = (left, right) => left.reduce(
  (sum, channel, index) => sum + channel * right[index],
  0,
);

/** CPU oracle for ToonLab's legacy GBuffer material conversion. */
export function evaluateToonLabSourceDefaultLitMaterialInputs({
  baseColor = [1, 1, 1],
  metallic = 0,
  roughness = 0.5,
  specular = TOONLAB_DEFAULT_SPECULAR,
} = {}) {
  const base = finiteColor(baseColor, 'baseColor');
  const materialMetallic = saturateNumber(finiteScalar(metallic, 'metallic'));
  const materialRoughness = saturateNumber(finiteScalar(roughness, 'roughness'));
  const materialSpecular = saturateNumber(finiteScalar(specular, 'specular'));
  const dielectricF0 = TOONLAB_DIELECTRIC_F0_SCALE * materialSpecular;
  const diffuseAlbedo = base.map((channel) => channel * (1 - materialMetallic));
  const f0 = base.map(
    (channel) => dielectricF0 * (1 - materialMetallic)
      + channel * materialMetallic,
  );
  return Object.freeze({
    baseColor: frozenColor(base),
    dielectricF0,
    diffuseAlbedo: frozenColor(diffuseAlbedo),
    f0: frozenColor(f0),
    f90: saturateNumber(50 * f0[1]),
    metallic: materialMetallic,
    roughness: materialRoughness,
    specular: materialSpecular,
  });
}

/**
 * CPU oracle for DefaultLitBxDF with zero-size punctual lights.
 * `lightColor` must already include light falloff, tint, and surface shadow.
 */
export function evaluateToonLabSourceDefaultLitDirect({
  baseColor = [1, 1, 1],
  lightColor = [1, 1, 1],
  lightDirection = [0, 0, 1],
  metallic = 0,
  normal = [0, 0, 1],
  roughness = 0.5,
  specular = TOONLAB_DEFAULT_SPECULAR,
  viewDirection = [0, 0, 1],
} = {}) {
  const material = evaluateToonLabSourceDefaultLitMaterialInputs({
    baseColor,
    metallic,
    roughness,
    specular,
  });
  const light = finiteDirection(lightDirection, 'lightDirection');
  const surfaceNormal = finiteDirection(normal, 'normal');
  const view = finiteDirection(viewDirection, 'viewDirection');
  const sourceLightColor = finiteColor(lightColor, 'lightColor');
  const rawNoL = dot3(surfaceNormal, light);
  if (!(rawNoL > 0)) {
    const black = Object.freeze([0, 0, 0]);
    return Object.freeze({
      brdfDiffuse: frozenColor(colorScale(material.diffuseAlbedo, 1 / Math.PI)),
      brdfSpecular: black,
      diffuse: black,
      f0: material.f0,
      f90: material.f90,
      nDotH: 0,
      nDotL: 0,
      nDotV: saturateNumber(Math.abs(dot3(surfaceNormal, view)) + TOONLAB_NO_V_EPSILON),
      specular: black,
      total: black,
      vDotH: 0,
    });
  }

  const halfUnnormalized = light.map((channel, index) => channel + view[index]);
  const halfLength = Math.hypot(...halfUnnormalized);
  const halfDirection = halfLength > TOONLAB_NUMERIC_EPSILON
    ? halfUnnormalized.map((channel) => channel / halfLength)
    : surfaceNormal;
  const nDotL = saturateNumber(rawNoL);
  const nDotV = saturateNumber(
    Math.abs(dot3(surfaceNormal, view)) + TOONLAB_NO_V_EPSILON,
  );
  const nDotH = saturateNumber(dot3(surfaceNormal, halfDirection));
  const vDotH = saturateNumber(dot3(view, halfDirection));
  const a2 = material.roughness ** 4;
  const distributionDenominator = (nDotH * a2 - nDotH) * nDotH + 1;
  const distribution = a2 / Math.max(
    Math.PI * distributionDenominator * distributionDenominator,
    TOONLAB_NUMERIC_EPSILON,
  );
  const alpha = Math.sqrt(a2);
  const visibilityDenominator = nDotL * (nDotV * (1 - alpha) + alpha)
    + nDotV * (nDotL * (1 - alpha) + alpha);
  const visibility = 0.5 / Math.max(
    visibilityDenominator,
    TOONLAB_NUMERIC_EPSILON,
  );
  const fresnelWeight = (1 - vDotH) ** 5;
  const fresnel = material.f0.map(
    (channel) => material.f90 * fresnelWeight
      + (1 - fresnelWeight) * channel,
  );
  const brdfDiffuse = colorScale(material.diffuseAlbedo, 1 / Math.PI);
  const brdfSpecular = colorScale(fresnel, distribution * visibility);
  const irradiance = colorScale(sourceLightColor, nDotL);
  const diffuse = colorMultiply(irradiance, brdfDiffuse);
  const directSpecular = colorMultiply(irradiance, brdfSpecular);
  return Object.freeze({
    brdfDiffuse: frozenColor(brdfDiffuse),
    brdfSpecular: frozenColor(brdfSpecular),
    diffuse: frozenColor(diffuse),
    f0: material.f0,
    f90: material.f90,
    nDotH,
    nDotL,
    nDotV,
    specular: frozenColor(directSpecular),
    total: frozenColor(colorAdd(diffuse, directSpecular)),
    vDotH,
  });
}

/** CPU oracle for the captured-SkyLight diffuse boundary. */
export function evaluateToonLabSourceDefaultLitIndirectDiffuse({
  baseColor = [1, 1, 1],
  irradiance = [0, 0, 0],
  metallic = 0,
  roughness = 0.5,
  specular = TOONLAB_DEFAULT_SPECULAR,
} = {}) {
  const material = evaluateToonLabSourceDefaultLitMaterialInputs({
    baseColor,
    metallic,
    roughness,
    specular,
  });
  return frozenColor(colorMultiply(
    finiteColor(irradiance, 'irradiance'),
    colorScale(material.diffuseAlbedo, 1 / Math.PI),
  ));
}

/**
 * CPU oracle for ToonLab's split-sum environment BRDF after the renderer supplies
 * its preintegrated AB sample. This verifies the exact F0/F90 boundary without
 * pretending that Three's DFG LUT texels equal ToonLab's PreIntegratedGF texels.
 */
export function evaluateToonLabSourceDefaultLitEnvBrdf({
  f0 = [0.04, 0.04, 0.04],
  preintegratedAb = [1, 0],
  radiance = [1, 1, 1],
} = {}) {
  const sourceF0 = finiteColor(f0, 'f0');
  const ab = finiteColor([
    preintegratedAb?.[0],
    preintegratedAb?.[1],
    0,
  ], 'preintegratedAb');
  const f90 = saturateNumber(50 * sourceF0[1]);
  const brdf = sourceF0.map((channel) => channel * ab[0] + f90 * ab[1]);
  return Object.freeze({
    brdf: frozenColor(brdf),
    f90,
    reflected: frozenColor(colorMultiply(
      finiteColor(radiance, 'radiance'),
      brdf,
    )),
  });
}

/** CPU source formula retained for the unresolved deferred AO compositor. */
export function evaluateToonLabSourceDefaultLitSpecularOcclusion({
  ambientOcclusion = 1,
  nDotV = 1,
  roughness = 0.5,
} = {}) {
  const ao = saturateNumber(finiteScalar(ambientOcclusion, 'ambientOcclusion'));
  const noV = saturateNumber(finiteScalar(nDotV, 'nDotV'));
  const sourceRoughness = saturateNumber(finiteScalar(roughness, 'roughness'));
  return saturateNumber(
    (noV + ao) ** (sourceRoughness * sourceRoughness) - 1 + ao,
  );
}

function toonLabDefaultLitInputs({
  metalnessNode,
  perceptualRoughnessNode,
  specularNode,
}) {
  const materialMetallic = clamp(float(metalnessNode), 0, 1);
  const materialSpecular = clamp(float(specularNode), 0, 1);
  const perceptualRoughness = clamp(float(perceptualRoughnessNode), 0, 1);
  const baseColor = diffuseColor.rgb;
  const dielectricF0 = materialSpecular.mul(TOONLAB_DIELECTRIC_F0_SCALE);
  return {
    diffuseAlbedo: baseColor.mul(float(1).sub(materialMetallic)),
    f0: mix(vec3(dielectricF0), baseColor, materialMetallic),
    perceptualRoughness,
  };
}

export class ToonLabSourceDefaultLitLightingModel extends PhysicalLightingModel {
  constructor({
    metalnessNode = metalness,
    perceptualRoughnessNode = materialRoughness,
    specularNode = float(TOONLAB_DEFAULT_SPECULAR),
  } = {}) {
    super(false, false, false, false, false, false);
    this.metalnessNode = metalnessNode;
    this.perceptualRoughnessNode = perceptualRoughnessNode;
    this.specularNode = specularNode;
  }

  direct({ lightDirection, lightColor, reflectedLight }) {
    const inputs = toonLabDefaultLitInputs(this);
    const nDotL = clamp(dot(normalView, lightDirection), 0, 1);
    // Three's light node has already applied tint, radial falloff, cloud
    // shadow, and surface shadow. Materialize that mutable expression once so
    // the source diffuse and specular lobes consume the same visibility.
    const irradiance = vec3(lightColor)
      .mul(nDotL)
      .toVar('toonLabDefaultLitIrradiance');
    reflectedLight.directDiffuse.addAssign(
      irradiance.mul(inputs.diffuseAlbedo).mul(1 / Math.PI),
    );

    const viewDirection = positionViewDirection;
    const halfDirection = normalize(lightDirection.add(viewDirection));
    const rawNoV = dot(normalView, viewDirection);
    const nDotV = clamp(abs(rawNoV).add(TOONLAB_NO_V_EPSILON), 0, 1);
    const nDotH = clamp(dot(normalView, halfDirection), 0, 1);
    const vDotH = clamp(dot(viewDirection, halfDirection), 0, 1);
    const a2 = pow(inputs.perceptualRoughness, 4);
    const d = nDotH.mul(a2).sub(nDotH).mul(nDotH).add(1);
    const distribution = a2.div(max(d.mul(d).mul(Math.PI), TOONLAB_NUMERIC_EPSILON));
    const alpha = pow(a2, 0.5);
    const visibilityV = nDotL.mul(
      nDotV.mul(float(1).sub(alpha)).add(alpha),
    );
    const visibilityL = nDotV.mul(
      nDotL.mul(float(1).sub(alpha)).add(alpha),
    );
    const visibility = float(0.5).div(max(
      visibilityV.add(visibilityL),
      TOONLAB_NUMERIC_EPSILON,
    ));
    const fresnelWeight = pow(float(1).sub(vDotH), 5);
    const f90 = clamp(inputs.f0.g.mul(50), 0, 1);
    const fresnel = vec3(f90)
      .mul(fresnelWeight)
      .add(inputs.f0.mul(float(1).sub(fresnelWeight)));
    reflectedLight.directSpecular.addAssign(
      irradiance.mul(distribution).mul(visibility).mul(fresnel),
    );
  }

  indirectDiffuse(builder) {
    const { irradiance, reflectedLight } = builder.context;
    const inputs = toonLabDefaultLitInputs(this);
    reflectedLight.indirectDiffuse.addAssign(
      irradiance.mul(inputs.diffuseAlbedo).mul(1 / Math.PI),
    );
  }

  indirectSpecular(builder) {
    const { radiance, reflectedLight } = builder.context;
    if (!radiance) return;
    const inputs = toonLabDefaultLitInputs(this);
    const nDotV = clamp(dot(normalView, positionViewDirection), 0, 1);
    // The source formula uses ToonLab's PreIntegratedGF. DFGLUT is intentionally a
    // renderer fallback: it preserves the split-sum topology while the
    // contract/ledger keep the actual LUT texels and reflection filtering open.
    const ab = DFGLUT({
      dotNV: nDotV,
      roughness: inputs.perceptualRoughness,
    });
    const f90 = clamp(inputs.f0.g.mul(50), 0, 1);
    const environmentBrdf = inputs.f0.mul(ab.x).add(vec3(f90).mul(ab.y));
    reflectedLight.indirectSpecular.addAssign(radiance.mul(environmentBrdf));
  }

  // ToonLab applies material/screen AO in deferred diffuse/reflection composition.
  // The source showcase owns that renderer pass, so do not reapply Three's
  // different material-level specular-occlusion approximation here.
  ambientOcclusion() {}
}

/** Install ToonLab legacy Default Lit on an ordinary opaque node material. */
export function installToonLabSourceDefaultLitLighting(material, options = {}) {
  if (!material?.isNodeMaterial) return material;
  material.setupLightingModel = () => new ToonLabSourceDefaultLitLightingModel({
    metalnessNode:
      options.metalnessNode ?? material.metalnessNode ?? metalness,
    perceptualRoughnessNode:
      options.perceptualRoughnessNode
      ?? material.roughnessNode
      ?? materialRoughness,
    specularNode:
      options.specularNode
      ?? material.specularIntensityNode
      ?? float(TOONLAB_DEFAULT_SPECULAR),
  });
  material.userData.toonLabSourceDefaultLitLighting = {
    ...TOONLAB_SOURCE_DEFAULT_LIT_CONTRACT,
    f0: 'lerp(0.08 * saturate(Specular), BaseColor, saturate(Metallic))',
    materialInputs: 'authored node outputs; Three IOR/specular remap bypassed',
    normal: 'resolved material normalView',
  };
  material.needsUpdate = true;
  return material;
}
