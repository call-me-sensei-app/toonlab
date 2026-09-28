import * as THREE from 'three';

const WHITE_PIXEL = new Uint8Array([255, 255, 255, 255]);

export const ROCK_GEOLOGY_PALETTES = Object.freeze({
  basalt: Object.freeze({ accent: [0.31, 0.34, 0.33], dark: [0.055, 0.06, 0.065], grainScale: 38, mid: [0.17, 0.18, 0.185], pale: [0.31, 0.32, 0.315], regionStrength: 0.1 }),
  granite: Object.freeze({ accent: [0.22, 0.25, 0.15], dark: [0.13, 0.125, 0.118], grainScale: 43, mid: [0.29, 0.275, 0.255], pale: [0.48, 0.455, 0.41], regionStrength: 0.17 }),
  limestone: Object.freeze({ accent: [0.29, 0.32, 0.17], dark: [0.15, 0.135, 0.105], grainScale: 34, mid: [0.36, 0.31, 0.235], pale: [0.58, 0.52, 0.405], regionStrength: 0.2 }),
  metamorphic: Object.freeze({ accent: [0.43, 0.41, 0.36], dark: [0.08, 0.09, 0.105], grainScale: 46, mid: [0.22, 0.24, 0.27], pale: [0.43, 0.45, 0.47], regionStrength: 0.13 }),
  'river-stone': Object.freeze({ accent: [0.25, 0.29, 0.2], dark: [0.12, 0.13, 0.135], grainScale: 52, mid: [0.29, 0.30, 0.30], pale: [0.47, 0.48, 0.47], regionStrength: 0.11 }),
  sandstone: Object.freeze({ accent: [0.46, 0.19, 0.075], dark: [0.18, 0.09, 0.038], grainScale: 56, mid: [0.44, 0.235, 0.095], pale: [0.67, 0.42, 0.19], regionStrength: 0.18 }),
});

function paletteFor(geology) {
  return ROCK_GEOLOGY_PALETTES[geology] ?? ROCK_GEOLOGY_PALETTES.granite;
}

function createWhiteTexture() {
  const texture = new THREE.DataTexture(WHITE_PIXEL, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export function createBakedRockMaterial({
  geology = 'granite',
  look = 'realistic',
  normalAo,
  surface,
} = {}) {
  const palette = paletteFor(geology);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: surface,
    metalness: 0,
    normalMap: normalAo,
    normalMapType: THREE.ObjectSpaceNormalMap,
    roughness: look === 'stylized' ? 0.84 : 0.94,
  });
  material.name = `ToonLab baked ${geology} / ${look}`;
  material.userData.toonlabMaterialId = `${geology}-${look}`;
  material.customProgramCacheKey = () => `toonlab-baked-rock-v1-${geology}-${look}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRockLook = { value: look === 'stylized' ? 1 : 0 };
    shader.uniforms.uRockDark = { value: new THREE.Color(...palette.dark) };
    shader.uniforms.uRockMid = { value: new THREE.Color(...palette.mid) };
    shader.uniforms.uRockPale = { value: new THREE.Color(...palette.pale) };
    shader.uniforms.uRockAccent = { value: new THREE.Color(...palette.accent) };
    shader.uniforms.uRockGrainScale = { value: palette.grainScale };
    shader.uniforms.uRockRegionStrength = { value: palette.regionStrength };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRockObjectPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRockObjectPosition = position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRockObjectPosition;
uniform float uRockLook;
uniform vec3 uRockDark;
uniform vec3 uRockMid;
uniform vec3 uRockPale;
uniform vec3 uRockAccent;
uniform float uRockGrainScale;
uniform float uRockRegionStrength;
float toonlabHash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float toonlabValueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = toonlabHash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = toonlabHash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = toonlabHash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = toonlabHash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = toonlabHash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = toonlabHash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = toonlabHash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = toonlabHash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 toonlabSurface = texture2D(map, vMapUv);
vec4 toonlabNormalAo = texture2D(normalMap, vNormalMapUv);
if (toonlabSurface.a < 0.08) discard;
float rockHeight = toonlabSurface.r * 2.0 - 1.0;
float rockCurvature = toonlabSurface.g * 2.0 - 1.0;
float rockRegion = toonlabSurface.b;
float rockAo = toonlabNormalAo.a;
vec3 rockNormalObject = normalize(toonlabNormalAo.xyz * 2.0 - 1.0);
float grain = toonlabValueNoise(vRockObjectPosition * uRockGrainScale);
float broadGrain = toonlabValueNoise(vRockObjectPosition * 5.2);
vec3 naturalStone = mix(uRockDark, uRockMid, 0.5 + broadGrain * 0.3);
naturalStone = mix(naturalStone, uRockPale, smoothstep(0.24, 0.86, rockCurvature) * 0.1);
naturalStone *= 0.94 + grain * 0.12;
naturalStone = mix(naturalStone, uRockPale * 1.08, smoothstep(0.91, 0.985, grain) * 0.045);
naturalStone = mix(naturalStone, uRockDark * 0.62, (1.0 - rockAo) * 0.48);
naturalStone = mix(naturalStone, uRockAccent, smoothstep(0.76, 0.95, rockRegion) * smoothstep(0.26, 0.82, rockNormalObject.y) * uRockRegionStrength);
float animeTop = smoothstep(-0.05, 0.78, rockNormalObject.y);
vec3 animeStone = mix(uRockMid * vec3(0.78, 0.9, 1.04), uRockPale * vec3(0.9, 1.0, 1.08), animeTop * 0.52);
animeStone = mix(animeStone, uRockPale, smoothstep(0.35, 0.9, rockCurvature) * 0.08);
animeStone = mix(animeStone, uRockDark * 0.78, (1.0 - rockAo) * 0.34);
animeStone = mix(animeStone, uRockAccent, smoothstep(0.78, 0.94, rockRegion) * animeTop * min(uRockRegionStrength * 1.55, 0.34));
diffuseColor.rgb *= mix(naturalStone, animeStone, uRockLook);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_OBJECTSPACE
  vec3 toonlabMappedNormal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
  toonlabMappedNormal = normalize(normalMatrix * toonlabMappedNormal);
  normal = normalize(mix(normal, toonlabMappedNormal, mix(1.0, 0.38, uRockLook)));
#else
  #include <normal_fragment_maps>
#endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        `float toonlabAoResponse = mix(0.58, 1.0, rockAo);
reflectedLight.indirectDiffuse *= toonlabAoResponse;
reflectedLight.directDiffuse *= mix(0.78, 1.0, rockAo);`,
      )
      .replace(
        '#include <opaque_fragment>',
`if (uRockLook > 0.5) {
  float value = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
  float band = floor(value * 5.0 + 0.5) / 5.0;
  outgoingLight *= mix(1.0, band / value, 0.22);
}
#include <opaque_fragment>`,
      );
  };
  return material;
}

export function createBeforeRockMaterial({ geology = 'granite' } = {}) {
  const palette = paletteFor(geology);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...palette.mid),
    metalness: 0,
    roughness: 0.94,
  });
  material.name = `ToonLab unbaked ${geology} baseline`;
  material.userData.toonlabMaterialId = `${geology}-unbaked-baseline`;
  return material;
}

export function createNeutralRockMaterial({ wireframe = false } = {}) {
  return new THREE.MeshStandardMaterial({
    color: wireframe ? 0x2b3230 : 0x8e918b,
    metalness: 0,
    roughness: 0.92,
    wireframe,
  });
}

export function createChannelMaterial(texture) {
  const material = new THREE.MeshBasicMaterial({ map: texture ?? createWhiteTexture() });
  material.name = 'ToonLab baked channel inspection';
  return material;
}
