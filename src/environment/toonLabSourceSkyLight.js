import {
  BackSide,
  Box3,
  BoxGeometry,
  Color,
  CubeCamera,
  DataUtils,
  HalfFloatType,
  LightProbe,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  RGBAFormat,
  Scene,
  SphereGeometry,
  SphericalHarmonics3,
  SRGBColorSpace,
  Vector3,
  WebGLCoordinateSystem,
} from 'three';
import {
  CubeRenderTarget,
  LightProbeNode,
  MeshBasicNodeMaterial,
  PMREMGenerator,
} from 'three/webgpu';
import {
  bentNormalView,
  cameraWorldMatrix,
  clearcoatNormalView,
  clearcoatRoughness,
  cubeTexture,
  float,
  getShIrradianceAt,
  max,
  normalView,
  normalWorld,
  pmremTexture,
  positionViewDirection,
  positionWorldDirection,
  pow4,
  roughness,
  vec3,
} from 'three/tsl';

import { resolveToonLabSkyLightIntensity } from './toonLabSourceLighting.js';

const TOONLAB_DIFFUSE_CUBEMAP_SIZE = 32;
const MIN_CAPTURE_RESOLUTION = 16;
const _captureBounds = new Box3();
const _captureBoundsCenter = new Vector3();
const _captureBoundsSize = new Vector3();

export const TOONLAB_SOURCE_SKYLIGHT_CONTRACT = Object.freeze({
  capture: Object.freeze({
    captureEmissiveOnly: 'USkyLightComponent.bCaptureEmissiveOnly',
    diffuseCubemapSize: TOONLAB_DIFFUSE_CUBEMAP_SIZE,
    fogParticipation: 'ordinary height fog remains enabled',
    lightingFeedback: 'SkyLighting disabled during a SkyLight capture',
    postProcessing: false,
    roughnessOverride: 1,
    visibility: 'complete scene clipped by SkyDistanceThreshold',
  }),
  diffuse: Object.freeze({
    clamp: 'max(0, GetSkySHDiffuse(normal))',
    representation: 'three-band RGB spherical harmonics',
  }),
  remainingBridges: Object.freeze([
    'ToonLab does not expose its stored processed SkyLight cubemap or irradiance SH through reflected component metadata; ToonLab recaptures the reconstructed scene.',
    'Three PMREM uses a GGX VNDF convolution instead of ToonLab reflection-capture filtering and encoding.',
    'Browser cube capture still differs in finite far-plane precision, renderer LOD selection, rasterization, and FP16 filtering/quantization.',
  ]),
  source: 'ToonLab ReflectionEnvironmentCapture + ReflectionEnvironmentDiffuseIrradiance',
  stage: 'partial',
});

const TOONLAB_SOURCE_SKYLIGHT_NATIVE_SH_BRIDGES = Object.freeze(
  TOONLAB_SOURCE_SKYLIGHT_CONTRACT.remainingBridges.slice(1),
);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function sourceTypeName(value) {
  const serialized = String(value ?? 'SLS_CAPTURED_SCENE').toUpperCase();
  if (serialized.includes('SPECIFIED')) return 'specified-cubemap';
  return 'captured-scene';
}

function powerOfTwoResolution(value) {
  const source = Math.max(MIN_CAPTURE_RESOLUTION, Math.round(finiteNumber(value, 128)));
  return 2 ** Math.round(Math.log2(source));
}

function srgbByteColor(value, fallback = [255, 255, 255]) {
  const channels = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return new Color().setRGB(
    finiteNumber(channels[0], fallback[0]) / 255,
    finiteNumber(channels[1], fallback[1]) / 255,
    finiteNumber(channels[2], fallback[2]) / 255,
    SRGBColorSpace,
  );
}

function linearColor(value, fallback = [0, 0, 0]) {
  const channels = Array.isArray(value) && value.length >= 3 ? value : fallback;
  return new Color().setRGB(
    finiteNumber(channels[0], fallback[0]),
    finiteNumber(channels[1], fallback[1]),
    finiteNumber(channels[2], fallback[2]),
  );
}

function toonLabPositionMeters(transform = {}) {
  const translation = Array.isArray(transform.translation)
    ? transform.translation
    : [0, 0, 0];
  return new Vector3(
    finiteNumber(translation[0], 0) * 0.01,
    finiteNumber(translation[2], 0) * 0.01,
    -finiteNumber(translation[1], 0) * 0.01,
  );
}

/**
 * Resolve the reflected USkyLightComponent values used by the capture and
 * shading paths. Colors remain separate: the lower color belongs to captured
 * radiance, while LightColor * Intensity is applied after convolution in ToonLab.
 */
export function resolveToonLabSourceSkyLightContract(component = {}, {
  intensityScale = 1,
} = {}) {
  const properties = component.properties ?? component;
  const captureResolution = powerOfTwoResolution(properties.cubemap_resolution);
  const diffuseMipLevel = Math.max(
    0,
    Math.round(Math.log2(captureResolution / TOONLAB_DIFFUSE_CUBEMAP_SIZE)),
  );

  return {
    affectGlobalIllumination: booleanValue(properties.affect_global_illumination, true),
    affectReflection: booleanValue(properties.affect_reflection, true),
    captureEmissiveOnly: booleanValue(properties.capture_emissive_only, false),
    capturePosition: toonLabPositionMeters(component.transform),
    captureResolution,
    castShadows: booleanValue(properties.cast_shadows, false),
    castVolumetricShadow: booleanValue(properties.cast_volumetric_shadow, true),
    cloudAmbientOcclusion: booleanValue(properties.cloud_ambient_occlusion, false),
    diffuseCubemapSize: TOONLAB_DIFFUSE_CUBEMAP_SIZE,
    diffuseMipLevel,
    indirectLightingIntensity: Math.max(
      0,
      finiteNumber(properties.indirect_lighting_intensity, 1),
    ),
    intensity: resolveToonLabSkyLightIntensity(properties, intensityScale),
    lightColor: srgbByteColor(properties.light_color, [195, 223, 255]),
    lowerHemisphereColor: linearColor(properties.lower_hemisphere_color),
    lowerHemisphereIsSolidColor: booleanValue(
      properties.lower_hemisphere_is_black,
      true,
    ),
    realTimeCapture: booleanValue(properties.real_time_capture, false),
    skyDistanceThresholdMeters: Math.max(
      Number.EPSILON,
      finiteNumber(properties.sky_distance_threshold, 150000) * 0.01,
    ),
    sourceCubemapAngle: finiteNumber(properties.source_cubemap_angle, 0),
    sourceType: sourceTypeName(properties.source_type),
  };
}

/** CPU form of Three/ToonLab's three-band cosine-convolved SH evaluation. */
export function evaluateToonLabSourceSkySh(coefficients, normal) {
  if (!Array.isArray(coefficients) || coefficients.length < 9) {
    throw new Error('Nine RGB SkyLight SH coefficients are required.');
  }
  const direction = Array.isArray(normal)
    ? new Vector3(...normal)
    : normal.clone();
  direction.normalize();
  const x = direction.x;
  const y = direction.y;
  const z = direction.z;
  const result = new Vector3();
  const add = (index, scalar) => {
    const value = coefficients[index];
    result.x += finiteNumber(value.x ?? value[0], 0) * scalar;
    result.y += finiteNumber(value.y ?? value[1], 0) * scalar;
    result.z += finiteNumber(value.z ?? value[2], 0) * scalar;
  };

  add(0, 0.886227);
  add(1, 2 * 0.511664 * y);
  add(2, 2 * 0.511664 * z);
  add(3, 2 * 0.511664 * x);
  add(4, 2 * 0.429043 * x * y);
  add(5, 2 * 0.429043 * y * z);
  add(6, 0.743125 * z * z - 0.247708);
  add(7, 2 * 0.429043 * x * z);
  add(8, 0.429043 * (x * x - y * y));
  result.set(Math.max(0, result.x), Math.max(0, result.y), Math.max(0, result.z));
  return result;
}

/** Build Three's raw radiance-SH container from ToonLab coefficients that have
 * already been transformed into ToonLab's right-handed Y-up convention.
 * Cosine convolution remains deferred to getShIrradianceAt at shading time.
 */
export function createToonLabSourceSkyShFromCoefficients(coefficients) {
  if (!Array.isArray(coefficients) || coefficients.length !== 9) {
    throw new Error('Exactly nine RGB SkyLight SH coefficients are required.');
  }
  const sh = new SphericalHarmonics3();
  coefficients.forEach((coefficient, index) => {
    if (!Array.isArray(coefficient) || coefficient.length !== 3) {
      throw new Error(`SkyLight SH coefficient ${index} must be an RGB array.`);
    }
    const channels = coefficient.map((value) => Number(value));
    if (channels.some((value) => !Number.isFinite(value))) {
      throw new Error(`SkyLight SH coefficient ${index} contains a non-finite value.`);
    }
    sh.coefficients[index].fromArray(channels);
  });
  return sh;
}

/**
 * Apply ToonLab's linear SkyLight color to a Three SH container.
 *
 * SphericalHarmonics3 stores Vector3 coefficients, while a SkyLight tint is a
 * THREE.Color. Vector3.multiply() reads x/y/z, not r/g/b, so passing Color to
 * it produces NaN coefficients and silently removes the entire indirect-light
 * contribution on the GPU. Keep this bridge explicit and CPU-verifiable.
 */
export function tintToonLabSourceSkySh(sh, tint) {
  if (!sh?.isSphericalHarmonics3 || !Array.isArray(sh.coefficients)) {
    throw new TypeError('A SphericalHarmonics3 source is required.');
  }
  const red = finiteNumber(tint?.r, Number.NaN);
  const green = finiteNumber(tint?.g, Number.NaN);
  const blue = finiteNumber(tint?.b, Number.NaN);
  if (![red, green, blue].every(Number.isFinite)) {
    throw new TypeError('A finite linear RGB SkyLight tint is required.');
  }
  const result = sh.clone();
  for (const coefficient of result.coefficients) {
    coefficient.set(
      coefficient.x * red,
      coefficient.y * green,
      coefficient.z * blue,
    );
  }
  return result;
}

function createRadianceContext(roughnessNode, normalViewNode) {
  let reflectVector = null;
  return {
    getTextureLevel: () => roughnessNode,
    getUV: () => {
      if (reflectVector === null) {
        reflectVector = positionViewDirection.negate().reflect(normalViewNode);
        reflectVector = pow4(roughnessNode)
          .mix(reflectVector, normalViewNode)
          .normalize()
          .transformDirection(cameraWorldMatrix);
      }
      return reflectVector;
    },
  };
}

/**
 * Three's stock LightProbe node omits ToonLab's nonnegative SH clamp and has no
 * filtered specular cubemap. This node adds those source-specific contracts;
 * ordinary LightProbe instances retain the stock implementation.
 */
export class ToonLabSourceCapturedSkyLightNode extends LightProbeNode {
  static get type() {
    return 'ToonLabSourceCapturedSkyLightNode';
  }

  setup(builder) {
    const source = this.light?.userData?.toonLabSourceSkyLight;
    if (!source) {
      super.setup(builder);
      return;
    }

    const irradiance = max(
      vec3(0),
      getShIrradianceAt(normalWorld, this.lightProbe),
    );
    builder.context.irradiance.addAssign(irradiance);

    if (!source.specularTexture || source.contract.affectReflection === false) return;
    const material = builder.material;
    const useAnisotropy = material.useAnisotropy === true || material.anisotropy > 0;
    const radianceNormal = useAnisotropy ? bentNormalView : normalView;
    const environment = pmremTexture(source.specularTexture);
    const radiance = environment
      .context(createRadianceContext(roughness, radianceNormal))
      .mul(this.colorNode);
    builder.context.radiance.addAssign(radiance);

    const clearcoatRadiance = builder.context.lightingModel.clearcoatRadiance;
    if (clearcoatRadiance) {
      clearcoatRadiance.addAssign(
        environment
          .context(createRadianceContext(clearcoatRoughness, clearcoatNormalView))
          .mul(this.colorNode),
      );
    }
  }
}

export function installToonLabSourceSkyLightNode(renderer) {
  if (!renderer?.library?.lightNodes) {
    throw new Error('A WebGPU renderer node library is required.');
  }
  renderer.library.lightNodes.set(LightProbe, ToonLabSourceCapturedSkyLightNode);
}

function countCaptureMeshes(scene) {
  let count = 0;
  let sourceSkyCount = 0;
  scene.traverse((object) => {
    if (!object.isMesh || object.visible === false) return;
    count += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => ['sky', 'clouds'].includes(
      material?.userData?.toonLabSource?.family,
    ))) sourceSkyCount += 1;
  });
  return { count, sourceSkyCount };
}

function restoreSourceCaptureTransforms(root) {
  if (!root) return () => {};
  const restored = [];
  root.traverse((object) => {
    const source = object.userData?.toonLabSourceSkyCapture;
    if (!source?.localScale || source.localScale.length < 3) return;
    restored.push({ object, scale: object.scale.clone() });
    object.scale.fromArray(source.localScale);
  });
  root.updateWorldMatrix(true, true);
  return () => {
    for (const entry of restored) entry.object.scale.copy(entry.scale);
    root.updateWorldMatrix(true, true);
  };
}

function resolveCaptureFar(scene, capturePosition, near) {
  scene.updateWorldMatrix(true, true);
  _captureBounds.makeEmpty().setFromObject(scene, true);
  if (_captureBounds.isEmpty()) return near * 4;
  _captureBounds.getCenter(_captureBoundsCenter);
  _captureBounds.getSize(_captureBoundsSize);
  const radius = _captureBoundsSize.length() * 0.5;
  return Math.max(
    near * 4,
    capturePosition.distanceTo(_captureBoundsCenter) + radius * 1.05,
  );
}

function collectCaptureOverrides(scene, contract) {
  const materials = new Map();
  const hiddenLights = [];
  scene.traverse((object) => {
    if (object.isLight && (
      object.isLightProbe
      || object.isHemisphereLight
      || contract.captureEmissiveOnly
    )) {
      hiddenLights.push({ object, visible: object.visible });
      object.visible = false;
    }
    if (!object.isMesh || !object.material) return;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (!material || materials.has(material)) continue;
      materials.set(material, {
        roughness: material.roughness,
        roughnessNode: material.roughnessNode,
      });
      if ('roughness' in material) material.roughness = 1;
      if ('roughnessNode' in material && material.isMeshBasicNodeMaterial !== true) {
        material.roughnessNode = float(1);
      }
      material.needsUpdate = true;
    }
  });
  return () => {
    for (const [material, state] of materials) {
      if ('roughness' in material) material.roughness = state.roughness;
      if ('roughnessNode' in material) material.roughnessNode = state.roughnessNode;
      material.needsUpdate = true;
    }
    for (const entry of hiddenLights) entry.object.visible = entry.visible;
  };
}

function createLowerHemisphere(contract) {
  if (!contract.lowerHemisphereIsSolidColor) return null;
  const radius = contract.skyDistanceThresholdMeters * 2;
  const geometry = new SphereGeometry(
    radius,
    128,
    64,
    0,
    Math.PI * 2,
    Math.PI / 2,
    Math.PI / 2,
  );
  const material = new MeshBasicNodeMaterial();
  material.color.copy(contract.lowerHemisphereColor);
  material.side = BackSide;
  material.depthTest = false;
  material.depthWrite = false;
  material.fog = false;
  material.toneMapped = false;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'TOONLAB_SkyLightCapture_LowerHemisphere';
  mesh.position.copy(contract.capturePosition);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1_000_000;
  return mesh;
}

function createCubeTarget(size, { mipmaps }) {
  return new CubeRenderTarget(size, {
    colorSpace: LinearSRGBColorSpace,
    depthBuffer: true,
    format: RGBAFormat,
    generateMipmaps: mipmaps,
    magFilter: LinearFilter,
    minFilter: mipmaps ? LinearMipmapLinearFilter : LinearFilter,
    type: HalfFloatType,
  });
}

async function resolveDiffuseSourceMip(renderer, cubeTarget, contract) {
  if (contract.diffuseMipLevel === 0 && contract.captureResolution === TOONLAB_DIFFUSE_CUBEMAP_SIZE) {
    return cubeTarget;
  }
  const target = createCubeTarget(TOONLAB_DIFFUSE_CUBEMAP_SIZE, { mipmaps: false });
  const material = new MeshBasicNodeMaterial();
  material.colorNode = cubeTexture(
    cubeTarget.texture,
    positionWorldDirection,
    float(contract.diffuseMipLevel),
  );
  material.side = BackSide;
  material.depthTest = false;
  material.depthWrite = false;
  material.fog = false;
  material.toneMapped = false;
  const geometry = new BoxGeometry(5, 5, 5);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const mipScene = new Scene();
  mipScene.background = new Color(0x000000);
  mipScene.add(mesh);
  const mipCamera = new CubeCamera(0.1, 10, target);
  mipCamera.update(renderer, mipScene);
  geometry.dispose();
  material.dispose();
  return target;
}

async function projectCubeTargetToSh(renderer, cubeTarget) {
  const flip = renderer.coordinateSystem === WebGLCoordinateSystem ? -1 : 1;
  const width = cubeTarget.width;
  const pixelSize = 2 / width;
  const coordinate = new Vector3();
  const direction = new Vector3();
  const basis = Array(9).fill(0);
  const sh = new SphericalHarmonics3();
  let totalWeight = 0;

  for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
    const data = await renderer.readRenderTargetPixelsAsync(
      cubeTarget,
      0,
      0,
      width,
      width,
      0,
      faceIndex,
    );
    for (let index = 0; index < width * width; index += 1) {
      const offset = index * 4;
      const red = DataUtils.fromHalfFloat(data[offset]);
      const green = DataUtils.fromHalfFloat(data[offset + 1]);
      const blue = DataUtils.fromHalfFloat(data[offset + 2]);
      const column = (1 - ((index % width) + 0.5) * pixelSize) * flip;
      const row = 1 - (Math.floor(index / width) + 0.5) * pixelSize;
      switch (faceIndex) {
        case 0: coordinate.set(-flip, row, column * flip); break;
        case 1: coordinate.set(flip, row, -column * flip); break;
        case 2: coordinate.set(column, 1, -row); break;
        case 3: coordinate.set(column, -1, row); break;
        case 4: coordinate.set(column, row, 1); break;
        case 5: coordinate.set(-column, row, -1); break;
        default: break;
      }
      const lengthSquared = coordinate.lengthSq();
      const weight = 4 / (Math.sqrt(lengthSquared) * lengthSquared);
      totalWeight += weight;
      direction.copy(coordinate).normalize();
      SphericalHarmonics3.getBasisAt(direction, basis);
      for (let coefficient = 0; coefficient < 9; coefficient += 1) {
        const scalar = basis[coefficient] * weight;
        sh.coefficients[coefficient].x += red * scalar;
        sh.coefficients[coefficient].y += green * scalar;
        sh.coefficients[coefficient].z += blue * scalar;
      }
    }
  }

  const normalization = (4 * Math.PI) / totalWeight;
  sh.scale(normalization);
  return sh;
}

/**
 * Capture and install one reflected SLS_CAPTURED_SCENE SkyLight.
 *
 * Capture is intentionally one-shot when RealTimeCapture is false, matching
 * the supplied ToonLabShowcase component. The complete scene is rendered with its
 * analytic fog node; only SkyLight feedback and post processing are removed.
 */
export async function createToonLabSourceCapturedSkyLight({
  component,
  diffuseCoefficients = null,
  enabled = true,
  intensityScale = 1,
  renderer,
  root = null,
  scene,
}) {
  if (!renderer || !scene) throw new Error('Renderer and scene are required.');
  const contract = resolveToonLabSourceSkyLightContract(component, { intensityScale });
  const nativeSh = diffuseCoefficients == null
    ? null
    : createToonLabSourceSkyShFromCoefficients(diffuseCoefficients);
  const bridges = nativeSh
    ? [...TOONLAB_SOURCE_SKYLIGHT_NATIVE_SH_BRIDGES]
    : [...TOONLAB_SOURCE_SKYLIGHT_CONTRACT.remainingBridges];
  const captureTint = contract.lightColor.clone();
  const lowerHemisphereColor = contract.lowerHemisphereColor.clone();
  const counts = countCaptureMeshes(scene);
  const disabledResult = {
    bridges,
    browserDiffuseSh: [],
    captureFar: 0,
    captureMeshCount: counts.count,
    captureTint,
    contract,
    diffuseSh: [],
    fogParticipation: scene.fogNode != null,
    intensity: 0,
    lowerHemisphereColor,
    mode: enabled ? 'unsupported-source' : 'disabled',
    renderTarget: null,
    sourceSkyMeshCount: counts.sourceSkyCount,
    tintedDiffuseSh: [],
  };
  if (!enabled || contract.sourceType !== 'captured-scene') return disabledResult;

  const restoreCaptureTransforms = restoreSourceCaptureTransforms(root);
  const restoreOverrides = collectCaptureOverrides(scene, contract);
  const previous = {
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    environmentNode: scene.environmentNode,
    exposure: renderer.toneMappingExposure,
    toneMapping: renderer.toneMapping,
  };
  let rawTarget = null;
  let diffuseTarget = null;
  let lowerHemisphere = null;
  let specularTarget = null;
  let captureFar = 0;

  try {
    scene.environment = null;
    scene.environmentNode = null;
    scene.environmentIntensity = 1;
    scene.background = new Color(0x000000);
    renderer.toneMapping = NoToneMapping;
    renderer.toneMappingExposure = 1;
    captureFar = resolveCaptureFar(
      scene,
      contract.capturePosition,
      contract.skyDistanceThresholdMeters,
    );
    lowerHemisphere = createLowerHemisphere(contract);
    if (lowerHemisphere) scene.add(lowerHemisphere);

    rawTarget = createCubeTarget(contract.captureResolution, { mipmaps: true });
    const captureCamera = new CubeCamera(
      contract.skyDistanceThresholdMeters,
      captureFar,
      rawTarget,
    );
    captureCamera.position.copy(contract.capturePosition);
    captureCamera.update(renderer, scene);

    diffuseTarget = await resolveDiffuseSourceMip(renderer, rawTarget, contract);
    const browserSh = await projectCubeTargetToSh(renderer, diffuseTarget);
    const rawSh = nativeSh ?? browserSh;
    const tintedSh = tintToonLabSourceSkySh(rawSh, captureTint);

    if (contract.affectReflection) {
      const generator = new PMREMGenerator(renderer);
      specularTarget = generator.fromCubemap(rawTarget.texture);
      generator.dispose();
    }

    const probe = new LightProbe(tintedSh, contract.intensity);
    probe.name = 'ToonLab Source Captured SkyLight';
    probe.color.copy(captureTint);
    probe.userData.toonLabSourceSkyLight = {
      contract,
      browserRawSh: browserSh.coefficients.map((coefficient) => coefficient.toArray()),
      nativeIrradiance: nativeSh != null,
      rawSh: rawSh.coefficients.map((coefficient) => coefficient.toArray()),
      specularTexture: specularTarget?.texture ?? null,
    };
    scene.add(probe);

    return {
      bridges,
      browserDiffuseSh: browserSh.coefficients.map(
        (coefficient) => coefficient.toArray(),
      ),
      captureFar,
      captureMeshCount: counts.count,
      captureTint,
      contract,
      diffuseSh: rawSh.coefficients.map((coefficient) => coefficient.toArray()),
      dispose() {
        probe.removeFromParent();
        specularTarget?.dispose();
      },
      fogParticipation: scene.fogNode != null,
      intensity: contract.intensity,
      lowerHemisphereColor,
      mode: nativeSh ? 'native-irradiance-sh' : 'captured-scene-sh',
      probe,
      renderTarget: specularTarget,
      sourceSkyMeshCount: counts.sourceSkyCount,
      tintedDiffuseSh: tintedSh.coefficients.map(
        (coefficient) => coefficient.toArray(),
      ),
    };
  } catch (error) {
    specularTarget?.dispose();
    throw error;
  } finally {
    lowerHemisphere?.removeFromParent();
    lowerHemisphere?.geometry.dispose();
    lowerHemisphere?.material.dispose();
    if (diffuseTarget && diffuseTarget !== rawTarget) diffuseTarget.dispose();
    rawTarget?.dispose();
    scene.background = previous.background;
    scene.environment = previous.environment;
    scene.environmentIntensity = previous.environmentIntensity;
    scene.environmentNode = previous.environmentNode;
    renderer.toneMapping = previous.toneMapping;
    renderer.toneMappingExposure = previous.exposure;
    restoreOverrides();
    restoreCaptureTransforms();
  }
}
