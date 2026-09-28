import {
  Color,
  LightProbe,
  SRGBColorSpace,
  SphericalHarmonics3,
  Vector3,
} from 'three';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

// Canonical Call Me Sensei outdoor rendering reference. Keeping the measured
// sky irradiance here makes it a package contract instead of a lab
// implementation detail. The values are Three-coordinate radiance SH; cosine
// convolution remains deferred to material lighting evaluation.
export const CALL_ME_SENSEI_LIGHTING_CONTRACT = deepFreeze({
  id: 'call-me-sensei-reference',
  skyLight: {
    affectReflection: false,
    colorSrgb8: [195, 223, 255],
    intensity: 1.2000000476837158,
    threeCoefficients: [
      [0.30126953125, 0.6728515625, 1.60546875],
      [0.095947265625, 0.328125, 1.0830078125],
      [-0.017120361328125, -0.016082763671875, -0.007476806640625],
      [0.009857177734375, 0.021820068359375, 0.03326416015625],
      [0.01303863525390625, 0.0227508544921875, 0.0263671875],
      [-0.0100250244140625, -0.00945281982421875, -0.005527496337890625],
      [0.099363074168460214, 0.15708390175645617, 0.16181062487932762],
      [0.01125335693359375, 0.00749969482421875, -0.0024280548095703125],
      [0.10191146316850777, 0.18247768951834009, 0.19243463365171404],
    ],
  },
  sun: {
    // The accepted outdoor daylight reference records a white directional-light
    // intensity of 8. Keep that source-calibrated value here; individual
    // material profiles own their albedo/exposure headroom. Lowering the
    // shared sun to compensate for one material makes neutral sun faces read
    // as sky-blue and breaks the bundle's cross-material lighting contract.
    intensity: 8,
    shadow: {
      // The package depth-color pass compares an orthographic float depth
      // map directly. A small receiver bias prevents the terrain from
      // shadowing itself while preserving character/tree/rock silhouettes.
      bias: -0.0004,
      // Skinned receivers use a constant depth-space guard instead of a
      // normal-space offset so animated triangles cannot surface as shadow
      // acne. This is consumed by ToonLab's node-backend sun-shadow pass.
      characterDepthBias: 0.001,
      cameraExtent: 34,
      // The light sits 60 m from its focus and the 68 m square coverage can
      // extend another ~48 m along an oblique sun direction. Keep the whole
      // receiver/caster volume inside the orthographic depth range.
      cameraFar: 140,
      cameraNear: 0.1,
      focusDistance: 10,
      followCamera: true,
      farCameraFar: 300,
      farExtent: 110,
      mapSize: 2048,
      // Match ToonLab's general shadow descriptor default. This is large
      // enough to suppress character self-shadow acne without crossing thin
      // skinned surfaces (the previous terrain-sized 0.5 m value did).
      normalBias: 0.01,
      radius: 0,
    },
  },
});

function linearSrgb8Color(source) {
  return new Color().setRGB(
    source[0] / 255,
    source[1] / 255,
    source[2] / 255,
    SRGBColorSpace,
  );
}

function finiteColor(source, fallback = [1, 1, 1]) {
  if (!Array.isArray(source) || source.length < 3) return fallback;
  const result = source.slice(0, 3).map(Number);
  return result.every(Number.isFinite) ? result : fallback;
}

export function createCallMeSenseiSkyLightProbe({
  contract = CALL_ME_SENSEI_LIGHTING_CONTRACT.skyLight,
  name = 'Call Me Sensei Sky Light',
} = {}) {
  const rawSh = new SphericalHarmonics3();
  contract.threeCoefficients.forEach((coefficient, index) => {
    rawSh.coefficients[index].fromArray(coefficient);
  });
  const tint = linearSrgb8Color(contract.colorSrgb8);
  const baseSh = rawSh.clone();
  for (const coefficient of baseSh.coefficients) {
    coefficient.set(
      coefficient.x * tint.r,
      coefficient.y * tint.g,
      coefficient.z * tint.b,
    );
  }
  const probe = new LightProbe(baseSh.clone(), contract.intensity);
  probe.name = name;
  probe.color.copy(tint);
  probe.userData.toonLabSourceSkyLight = {
    contract,
    nativeIrradiance: true,
    rawSh: rawSh.coefficients.map((coefficient) => coefficient.toArray()),
    specularTexture: null,
  };
  probe.userData.callMeSenseiLighting = { baseSh };
  return probe;
}

export function updateCallMeSenseiSkyLightProbe(probe, {
  color = [1, 1, 1],
  energy = 1,
  intensity = CALL_ME_SENSEI_LIGHTING_CONTRACT.skyLight.intensity,
} = {}) {
  const baseSh = probe?.userData?.callMeSenseiLighting?.baseSh;
  if (!probe?.isLightProbe || !baseSh?.isSphericalHarmonics3) {
    throw new TypeError('A Call Me Sensei LightProbe is required.');
  }
  const channels = finiteColor(color);
  const scale = Math.max(Number(energy) || 0, 0);
  const nextSh = baseSh.clone();
  for (const coefficient of nextSh.coefficients) {
    coefficient.multiply(new Vector3(...channels)).multiplyScalar(scale);
  }
  probe.sh.copy(nextSh);
  probe.intensity = Math.max(Number(intensity) || 0, 0);
  return probe;
}

export function configureCallMeSenseiDirectionalLight(light, {
  contract = CALL_ME_SENSEI_LIGHTING_CONTRACT.sun,
} = {}) {
  if (!light?.isDirectionalLight || !light.shadow) {
    throw new TypeError('A Three DirectionalLight with a shadow is required.');
  }
  const settings = contract.shadow;
  light.castShadow = true;
  light.shadow.mapSize.set(settings.mapSize, settings.mapSize);
  light.shadow.camera.near = settings.cameraNear;
  light.shadow.camera.far = settings.cameraFar;
  light.shadow.camera.left = -settings.cameraExtent;
  light.shadow.camera.right = settings.cameraExtent;
  light.shadow.camera.top = settings.cameraExtent;
  light.shadow.camera.bottom = -settings.cameraExtent;
  light.shadow.bias = settings.bias;
  light.shadow.normalBias = settings.normalBias;
  light.shadow.toonLabConstantDepthBias = settings.characterDepthBias;
  light.shadow.toonLabFarCameraFar = settings.farCameraFar;
  light.shadow.toonLabFarExtent = settings.farExtent;
  light.shadow.radius = settings.radius;
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.toonLabLightingContract = CALL_ME_SENSEI_LIGHTING_CONTRACT.id;
  return light;
}
