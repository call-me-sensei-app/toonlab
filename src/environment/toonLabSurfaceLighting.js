// ToonLab surface-lighting bridge.
//
// This ports the active forward-light BRDF convention rather than feeding
// ToonLab material inputs through Three's GGX/Lambert implementation. The two
// renderers expose similarly named PBR inputs, but ToonLab's direct and baked-GI
// diffuse terms do not contain Lambert 1/PI and TOONLAB uses its optimized
// DirectBRDFSpecular expression. Those are renderer rules, not art tuning.

import { PhysicalLightingModel } from 'three/webgpu';
import {
  clamp,
  diffuseColor,
  dot,
  float,
  max,
  materialRoughness,
  materialSpecularColor,
  metalness,
  mix,
  normalView,
  normalize,
  positionWorld,
  positionViewDirection,
  vec3,
} from 'three/tsl';

import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';

const THREE_LAMBERT_INPUT_SCALE_INVERSE = 1 / Math.PI;
const TOONLAB_DIELECTRIC_SPECULAR = 0.04;
const TOONLAB_ONE_MINUS_DIELECTRIC_SPECULAR = 0.96;
// HLSL `half` lower bounds used by InitializeBRDFDataDirect.
const TOONLAB_HALF_MIN_SQRT = 0.0078125;
const TOONLAB_HALF_MIN = 0.00006103515625;

export const TOONLAB_SURFACE_LIGHTING_SOURCE = Object.freeze({
  captureReport:
    'assets-local/reference-environment/environment-capture-current/toonlab-reference.txt',
  captureReportSha256:
    '9d3c4e758e256013cb1f4fd6517d754b61e86f7ebda7e63f55683651b8b32f98',
  ambientProbe: 'ShaderLibrary/AmbientProbe.hlsl',
  ambientProbeSha256: 'c34711410eddad9de1f189ced4e711d02c0245cfb8dd3bb93d06944ad8d5aa54',
  brdf: 'ShaderLibrary/BRDF.hlsl',
  brdfSha256: '1e8427056b0ab3046adf753d72fc3afee3d54c335e38a4d1069e6eedb0f78075',
  corePackage: '@call-me-sensei/toonlab/environment',
  globalIllumination: 'ShaderLibrary/GlobalIllumination.hlsl',
  globalIlluminationSha256: 'a2eac4011d4ef041fda672e9f612993d1de035f46b882ecf4c3852ba40c87198',
  lighting: 'ShaderLibrary/Lighting.hlsl',
  lightingSha256: '26ab9a1634466a75ea8926528e882e05f9960fbb60f5021c044decb03d156e38',
  sphericalHarmonics: 'ShaderLibrary/SphericalHarmonics.hlsl',
  sphericalHarmonicsSha256: 'ad654583b2dffc159ebad16383d560f6e710d1b2fe87aa18e1a47596cb0261da',
  sphericalHarmonicsUpload: 'Runtime/Utilities/BatchRendererGroupGlobals.cs',
  sphericalHarmonicsUploadSha256:
    'bb5c52577e4fab32bc1b9d39c252992faec1c6879cc8ac53b612fd938f8f1842',
  sceneManifest:
    'assets-local/reference-environment/environment-capture-current/scene-manifest.json',
  sceneManifestSha256:
    '762ac1e90938e2d793618163dc150990f8c03ccdb02fedde70646c7244170179',
  sceneDocument: 'Assets/ToonLab/Demo/EnvironmentReferenceScene.toonlab',
  sceneDocumentSha256:
    'a024b1a62a99f054dbd3a700c5d1707e4b90498f37d64a375f8c39f222bce58b',
  pipelinePackage: '@call-me-sensei/toonlab/environment',
});

/**
 * Renderer-boundary conventions accepted by the ToonLab BRDF.
 *
 * Both indirect adapters consume Three's physical, cosine-convolved
 * irradiance and divide by PI exactly once. Direct inputs also require an
 * explicit boundary. ToonLab Stage removes its deliberate PI pre-scale to
 * recover TOONLAB light radiance. The ToonLab source stage divides raw ToonLab radiance by
 * PI because ToonLab Default Lit contains Lambert's 1 / PI while literal TOONLAB Lit
 * does not. Without that cross-engine conversion ToonLab-derived rocks become
 * PI times brighter than the ToonLab materials they replace.
 */
export const TOONLAB_SURFACE_INPUT_ADAPTERS = Object.freeze({
  toonLabStage: Object.freeze({
    directInput:
      'ToonLab Light radiance pre-multiplied by PI for stock Three Lambert coexistence',
    directNormalization: THREE_LAMBERT_INPUT_SCALE_INVERSE,
    id: 'toonlab-stage',
    indirectInput:
      'ToonLab bakedGI pre-multiplied by PI before entering Three irradiance',
    indirectNormalization: THREE_LAMBERT_INPUT_SCALE_INVERSE,
  }),
  toonLabCapturedSceneSh: Object.freeze({
    directInput:
      'raw ToonLab source-stage analytic-light radiance using ToonLab Lambert energy convention',
    directNormalization: THREE_LAMBERT_INPUT_SCALE_INVERSE,
    id: 'toonlab-captured-scene-sh',
    indirectInput:
      'Three LightProbe cosine-convolved irradiance from the ToonLab captured-scene SH',
    indirectNormalization: THREE_LAMBERT_INPUT_SCALE_INVERSE,
  }),
});

const DEFAULT_INPUT_ADAPTER = TOONLAB_SURFACE_INPUT_ADAPTERS.toonLabStage;

export function resolveToonLabSurfaceInputAdapter(
  inputAdapter = DEFAULT_INPUT_ADAPTER.id,
) {
  const id = typeof inputAdapter === 'string'
    ? inputAdapter
    : inputAdapter?.id;
  const resolved = Object.values(TOONLAB_SURFACE_INPUT_ADAPTERS)
    .find((candidate) => candidate.id === id);
  if (!resolved) {
    throw new RangeError(
      `Unknown ToonLab lighting input adapter "${String(id)}".`,
    );
  }
  return resolved;
}

export const TOONLAB_SURFACE_LIGHTING_CONTRACT = Object.freeze({
  source: 'ToonLab renderer ShaderLibrary/BRDF.hlsl + Lighting.hlsl',
  directDiffuse: 'radiance * BRDFData.diffuse (no 1/PI)',
  indirectDiffuse: 'bakedGI * BRDFData.diffuse (no 1/PI)',
  directSpecular: 'TOONLAB DirectBRDFSpecular optimized GGX',
  shadowFill:
    'authored fraction of the sun retained where the package sun-shadow pass reports occlusion (0 = TOONLAB literal)',
  defaultInputAdapter: DEFAULT_INPUT_ADAPTER.id,
  inputNormalization:
    'direct radiance and cosine-convolved indirect irradiance are normalized independently',
  threeLightInputScaleInverse: THREE_LAMBERT_INPUT_SCALE_INVERSE,
  dielectricSpecular: TOONLAB_DIELECTRIC_SPECULAR,
  environmentReflections: Object.freeze({
    activeContribution: 'black',
    customReflection: null,
    defaultMode: 'Skybox',
    reflectionBounces: 1,
    reflectionIntensity: 1,
    skyboxMaterial: null,
  }),
});

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

const frozenColor = (value) => Object.freeze([...value]);

/** CPU oracle for the diffuse-only direct/indirect input decomposition. */
export function evaluateToonLabSurfaceDiffuseDecomposition({
  brdfDiffuse = [1, 1, 1],
  directStrength = 1,
  directInput = [0, 0, 0],
  indirectInput = [0, 0, 0],
  inputAdapter = DEFAULT_INPUT_ADAPTER.id,
  nDotL = 1,
} = {}) {
  const adapter = resolveToonLabSurfaceInputAdapter(inputAdapter);
  const diffuse = finiteColor(brdfDiffuse, 'brdfDiffuse');
  const direct = finiteColor(directInput, 'directInput');
  const indirect = finiteColor(indirectInput, 'indirectInput');
  const sourceCosine = Number(nDotL);
  if (!Number.isFinite(sourceCosine)) throw new TypeError('nDotL must be finite.');
  const cosine = Math.min(1, Math.max(0, sourceCosine));
  const resolvedDirectStrength = Math.max(Number(directStrength) || 0, 0);
  const directRadiance = direct.map(
    (channel) => channel * adapter.directNormalization * resolvedDirectStrength * cosine,
  );
  const indirectBakedGi = indirect.map(
    (channel) => channel * adapter.indirectNormalization,
  );
  const directDiffuse = directRadiance.map(
    (channel, index) => channel * diffuse[index],
  );
  const indirectDiffuse = indirectBakedGi.map(
    (channel, index) => channel * diffuse[index],
  );
  return Object.freeze({
    adapterId: adapter.id,
    directDiffuse: frozenColor(directDiffuse),
    directRadiance: frozenColor(directRadiance),
    indirectBakedGi: frozenColor(indirectBakedGi),
    indirectDiffuse: frozenColor(indirectDiffuse),
    totalDiffuse: frozenColor(directDiffuse.map(
      (channel, index) => channel + indirectDiffuse[index],
    )),
  });
}

function toonLabSpecularReflectivity(color) {
  return max(color.r, max(color.g, color.b));
}

function toonLabBrdfInputs(workflow, specularF0Node, diffuseAlphaNode = float(1)) {
  if (workflow === 'specular') {
    // ToonLab graph's Specular port is already the final ToonLab F0. Do not use
    // Three's global `specularColor` here: MeshPhysicalNodeMaterial scales its
    // specularColorNode by the IOR-derived dielectric F0 (0.04 at IOR 1.5),
    // which would make the supplied foliage F0 about 25 times too small.
    const toonLabSpecularF0 = vec3(specularF0Node);
    const reflectivity = toonLabSpecularReflectivity(toonLabSpecularF0);
    return {
      // BRDF.hlsl's `_ALPHAPREMULTIPLY_ON` path multiplies only the diffuse
      // term by surface alpha. Specular and emission remain unscaled and the
      // render target uses Blend One OneMinusSrcAlpha. Keeping that operation
      // in the ToonLab BRDF bridge avoids Three premultiplying the final RGB.
      diffuse: diffuseColor.rgb
        .mul(float(1).sub(reflectivity))
        .mul(diffuseAlphaNode),
      specular: toonLabSpecularF0,
    };
  }
  return {
    diffuse: diffuseColor.rgb
      .mul(float(1).sub(metalness))
      .mul(TOONLAB_ONE_MINUS_DIELECTRIC_SPECULAR)
      .mul(diffuseAlphaNode),
    specular: mix(
      vec3(TOONLAB_DIELECTRIC_SPECULAR),
      diffuseColor.rgb,
      metalness,
    ),
  };
}

export class ToonLabSurfaceLightingModel extends PhysicalLightingModel {
  constructor({
    diffuseAlphaNode = float(1),
    directStrength = 1,
    indirectStrength = 1,
    indirectTint = [1, 1, 1],
    indirectTintNode = null,
    indirectReplaceTintNode = null,
    indirectTintBlendNode = null,
    indirectTintMode = 'multiply',
    inputAdapter = DEFAULT_INPUT_ADAPTER.id,
    perceptualRoughnessNode = materialRoughness,
    shadowFill = 0,
    shadowFillTint = [1, 1, 1],
    useSharedSunShadow = true,
    specularF0Node = materialSpecularColor,
    workflow = 'metallic',
  } = {}) {
    super(false, false, false, false, false, false);
    this.diffuseAlphaNode = diffuseAlphaNode;
    this.directStrength = float(Math.max(Number(directStrength) || 0, 0));
    this.indirectStrength = float(Math.max(Number(indirectStrength) || 0, 0));
    // A static tint is sufficient for authored indoor materials, but outdoor
    // surfaces need the active sky colour to remain live as time-of-day and
    // weather change. Accepting a node here lets callers bind that scene state
    // without rebuilding the material or baking a permanent daylight-blue cast.
    this.indirectTint = indirectTintNode
      ? vec3(indirectTintNode)
      : vec3(...indirectTint);
    this.indirectReplaceTint = indirectReplaceTintNode
      ? vec3(indirectReplaceTintNode)
      : this.indirectTint;
    this.indirectTintBlend = indirectTintBlendNode ?? float(0);
    this.indirectTintMode = ['replace-chroma', 'sky-adaptive'].includes(indirectTintMode)
      ? indirectTintMode
      : 'multiply';
    this.inputAdapter = resolveToonLabSurfaceInputAdapter(inputAdapter);
    this.perceptualRoughnessNode = perceptualRoughnessNode;
    this.shadowFill = Math.min(Math.max(Number(shadowFill) || 0, 0), 1);
    this.shadowFillTint = shadowFillTint;
    this.useSharedSunShadow = useSharedSunShadow !== false;
    this.workflow = workflow === 'specular' ? 'specular' : 'metallic';
    this.specularF0Node = specularF0Node;
  }

  direct({ lightDirection, lightColor, lightNode, reflectedLight }) {
    // Normalize the selected renderer boundary once so diffuse and specular
    // see one consistent TOONLAB-domain light input. ToonLab Stage removes its
    // deliberate PI pre-scale; ToonLab source stage converts ToonLab Lambert energy to
    // TOONLAB's no-PI BRDF convention.
    // Three can carry analytic light attenuation as RGBA for transmitted
    // coloured shadows. TOONLAB's Light.color is RGB, so consume RGB explicitly.
    // The package sun-shadow sample is a hard 0/1 mask. Applied raw it removes
    // the ENTIRE direct term on an occluded fragment, and a Call Me Sensei rig
    // has no ambient light behind it — only the SH sky probe, whose measured
    // radiance is R:G:B ~ 1 : 2.2 : 5.3. A fully occluded ToonLab surface
    // therefore renders as saturated navy with no value structure at all
    // (D19-062). `shadowFill` keeps an authored, tintable fraction of the sun
    // in shadow, which is the shadow-lift the environment node material has
    // always had and this bridge did not. Default 0 — an existing caller
    // resolves to exactly the previous expression.
    const hasToonLabSunContract = Boolean(
      lightNode?.light?.shadow?.toonLabLightingContract,
    );
    const sunVisibility = hasToonLabSunContract && this.useSharedSunShadow
      ? sampleEnvironmentSunShadow(positionWorld)
      : float(1);
    // Cloud transmittance remains shared even when a material relies on the
    // native directional shadow. This avoids double/self-shadowing while every
    // outdoor surface still sees the same moving cloud field.
    const rawSunVisibility = hasToonLabSunContract
      ? sunVisibility.mul(sampleEnvironmentCloudShadow(positionWorld, 1))
      : float(1);
    const sharedSunVisibility = this.shadowFill > 0
      ? mix(float(this.shadowFill).mul(vec3(...this.shadowFillTint)), vec3(1), rawSunVisibility)
      : rawSunVisibility;
    const toonLabLightColor = vec3(lightColor)
      .mul(this.inputAdapter.directNormalization)
      .mul(this.directStrength)
      .mul(sharedSunVisibility);
    const nDotL = clamp(dot(normalView, lightDirection), 0, 1);
    // Materialize the shadowed light once. CSM attenuation contains mutable
    // TSL control flow; inlining it through multiple BRDF expressions causes
    // later cascade branches to inherit the previous branch's zero value.
    // TOONLAB likewise computes one `radiance` half3 before evaluating the BRDF.
    // Let the node builder assign a scope-safe symbol. A fixed declaration
    // name collides when several ToonLab material graphs compile in one scene.
    const radiance = nDotL.mul(toonLabLightColor).toVar();
    const brdf = toonLabBrdfInputs(
      this.workflow,
      this.specularF0Node,
      this.diffuseAlphaNode,
    );

    reflectedLight.directDiffuse.addAssign(radiance.mul(brdf.diffuse));

    const halfDirection = normalize(lightDirection.add(positionViewDirection));
    const nDotH = clamp(dot(normalView, halfDirection), 0, 1);
    const lDotH = clamp(dot(lightDirection, halfDirection), 0, 1);
    // TOONLAB consumes ToonLab graph's literal `1 - Smoothness`. Three's global
    // roughness has already been clamped and widened by geometry roughness,
    // so retaining the authored node is required for the same highlight.
    const perceptualRoughness = clamp(float(this.perceptualRoughnessNode), 0, 1);
    const toonLabRoughness = max(
      perceptualRoughness.mul(perceptualRoughness),
      TOONLAB_HALF_MIN_SQRT,
    );
    const roughnessSquared = max(
      toonLabRoughness.mul(toonLabRoughness),
      TOONLAB_HALF_MIN,
    );
    const d = nDotH.mul(nDotH)
      .mul(roughnessSquared.sub(1))
      .add(1.00001);
    const normalization = toonLabRoughness.mul(4).add(2);
    const specularTerm = roughnessSquared.div(
      d.mul(d)
        .mul(max(0.1, lDotH.mul(lDotH)))
        .mul(normalization),
    );
    reflectedLight.directSpecular.addAssign(
      radiance.mul(brdf.specular).mul(specularTerm),
    );
  }

  indirectDiffuse(builder) {
    const { irradiance, reflectedLight } = builder.context;
    const brdf = toonLabBrdfInputs(
      this.workflow,
      this.specularF0Node,
      this.diffuseAlphaNode,
    );
    const adaptedIrradiance = irradiance
      .mul(this.inputAdapter.indirectNormalization)
      .mul(this.indirectStrength);
    // Outdoor probes already contain colour. Multiplying a cool sunset probe
    // by an orange horizon collapses both toward dark purple. Rocks instead
    // retain the probe's directional luminance and receive chroma from the live
    // visible sky, which is the scene state the player actually sees.
    const multipliedIrradiance = adaptedIrradiance.mul(this.indirectTint);
    const replacedIrradiance = vec3(
      dot(adaptedIrradiance, vec3(0.2126, 0.7152, 0.0722)),
    ).mul(this.indirectReplaceTint);
    const tintedIrradiance = this.indirectTintMode === 'replace-chroma'
      ? replacedIrradiance
      : this.indirectTintMode === 'sky-adaptive'
        ? mix(multipliedIrradiance, replacedIrradiance, this.indirectTintBlend)
        : multipliedIrradiance;
    reflectedLight.indirectDiffuse.addAssign(
      tintedIrradiance.mul(brdf.diffuse),
    );
  }

  // The captured ToonLab scene has RenderSettings.skybox=null and no custom
  // reflection cubemap. TOONLAB still executes GlossyEnvironmentReflection(), but
  // its bound fallback is black. Keep the hook explicit so a future quality
  // profile can supply captured radiance without changing the source-baseline
  // BRDF or silently inheriting Three's scene.environment.
  indirectSpecular() {}
}

/** Install TOONLAB lighting on an existing MeshPhysicalNodeMaterial instance. */
export function installToonLabSurfaceLighting(material, options = {}) {
  if (!material?.isNodeMaterial) return material;
  const prior = material.userData?.toonLabSurfaceLighting;
  const inputAdapter = resolveToonLabSurfaceInputAdapter(
    options.inputAdapter ?? prior?.inputAdapter ?? DEFAULT_INPUT_ADAPTER.id,
  );
  const workflow = options.workflow ?? prior?.workflow ?? 'metallic';
  const resolvedWorkflow = workflow === 'specular' ? 'specular' : 'metallic';
  const diffuseAlphaNode = options.diffuseAlphaNode ?? float(1);
  const directStrength = Math.max(Number(
    options.directStrength ?? prior?.directStrength ?? 1,
  ) || 0, 0);
  const indirectStrength = Math.max(Number(
    options.indirectStrength ?? prior?.indirectStrength ?? 1,
  ) || 0, 0);
  const indirectTint = finiteColor(
    options.indirectTint ?? prior?.indirectTint ?? [1, 1, 1],
    'indirectTint',
  );
  const indirectTintNode = options.indirectTintNode ?? null;
  const indirectReplaceTintNode = options.indirectReplaceTintNode ?? null;
  const indirectTintBlendNode = options.indirectTintBlendNode ?? null;
  const requestedIndirectTintMode = options.indirectTintMode ?? prior?.indirectTintMode;
  const indirectTintMode = ['replace-chroma', 'sky-adaptive'].includes(requestedIndirectTintMode)
    ? requestedIndirectTintMode
    : 'multiply';
  const shadowFill = Math.min(Math.max(Number(
    options.shadowFill ?? prior?.shadowFill ?? 0,
  ) || 0, 0), 1);
  const shadowFillTint = finiteColor(
    options.shadowFillTint ?? prior?.shadowFillTint ?? [1, 1, 1],
    'shadowFillTint',
  );
  const useSharedSunShadow = options.useSharedSunShadow
    ?? prior?.useSharedSunShadow
    ?? true;
  material.setupLightingModel = () => new ToonLabSurfaceLightingModel({
    diffuseAlphaNode,
    directStrength,
    indirectStrength,
    indirectTint,
    indirectTintNode,
    indirectReplaceTintNode,
    indirectTintBlendNode,
    indirectTintMode,
    inputAdapter,
    perceptualRoughnessNode: material.roughnessNode ?? materialRoughness,
    shadowFill,
    shadowFillTint,
    useSharedSunShadow,
    specularF0Node: material.specularColorNode ?? materialSpecularColor,
    workflow: resolvedWorkflow,
  });
  material.userData.toonLabSurfaceLighting = {
    ...TOONLAB_SURFACE_LIGHTING_CONTRACT,
    inputAdapter: inputAdapter.id,
    inputAdapterContract: { ...inputAdapter },
    directStrength,
    indirectStrength,
    indirectTint: [...indirectTint],
    indirectTintSource: indirectTintNode ? 'dynamic-node' : 'static',
    indirectReplaceTintSource: indirectReplaceTintNode ? 'dynamic-node' : 'shared',
    indirectTintBlendSource: indirectTintBlendNode ? 'dynamic-node' : 'static-zero',
    indirectTintMode,
    preserveSpecularAlpha: options.diffuseAlphaNode != null,
    shadowFill,
    shadowFillTint: [...shadowFillTint],
    useSharedSunShadow: useSharedSunShadow !== false,
    workflow: resolvedWorkflow,
  };
  material.needsUpdate = true;
  return material;
}
