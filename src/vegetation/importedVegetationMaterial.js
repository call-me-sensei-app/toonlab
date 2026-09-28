import * as THREE from 'three';

import {
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_MATERIAL_VARIANTS,
  resolveVegetationShaderRoleSettings,
  tagVegetationMaterial,
} from './vegetationShaders.js';

let importedVegetationGradientMap = null;

function getImportedVegetationGradientMap() {
  if (importedVegetationGradientMap) return importedVegetationGradientMap;
  const data = new Uint8Array([54, 142, 224, 255]);
  const texture = new THREE.DataTexture(
    data,
    data.length,
    1,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'ToonLab imported vegetation bands';
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  importedVegetationGradientMap = texture;
  return texture;
}

function copyTextureTransform(target, source) {
  if (!target || !source) return;
  target.offset.copy(source.offset);
  target.repeat.copy(source.repeat);
  target.center.copy(source.center);
  target.rotation = source.rotation;
  target.wrapS = source.wrapS;
  target.wrapT = source.wrapT;
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  if (!source.matrixAutoUpdate) target.matrix.copy(source.matrix);
}

/**
 * WebGL compatibility material for vegetation embedded in imported GLBs.
 *
 * The canonical procedural tree materials are TSL/WebGPU NodeMaterials. This
 * adapter consumes the same VegetationShaderProfile and semantic roles while
 * retaining an imported mesh's authored albedo, alpha cutout, UVs, and normal
 * detail, so a WebGL scene can route foliage and wood through the nature
 * treatment without rebuilding the source geometry.
 */
export function createImportedVegetationMaterial(source, {
  profile = {},
  role = VEGETATION_MATERIAL_ROLES.foliageCard,
} = {}) {
  if (!source?.isMaterial) {
    throw new Error('createImportedVegetationMaterial requires a source material.');
  }
  if (
    role !== VEGETATION_MATERIAL_ROLES.foliageCard
    && role !== VEGETATION_MATERIAL_ROLES.woodySurface
  ) {
    throw new Error(`Imported vegetation role "${role}" is not supported.`);
  }

  const settings = resolveVegetationShaderRoleSettings(role, profile);
  const isFoliage = role === VEGETATION_MATERIAL_ROLES.foliageCard;
  const material = new THREE.MeshToonMaterial({
    alphaMap: source.alphaMap ?? null,
    alphaTest: isFoliage
      ? Math.max(Number(source.alphaTest) || 0, 0.3)
      : Number(source.alphaTest) || 0,
    aoMap: source.aoMap ?? null,
    aoMapIntensity: source.aoMapIntensity ?? 1,
    color: source.color?.clone() ?? new THREE.Color(0xffffff),
    emissive: source.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveIntensity: source.emissiveIntensity ?? 1,
    emissiveMap: source.emissiveMap ?? null,
    gradientMap: getImportedVegetationGradientMap(),
    lightMap: source.lightMap ?? null,
    lightMapIntensity: source.lightMapIntensity ?? 1,
    map: source.map ?? null,
    normalMap: source.normalMap ?? null,
    normalMapType: source.normalMapType ?? THREE.TangentSpaceNormalMap,
    normalScale: source.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    opacity: source.opacity ?? 1,
    side: isFoliage ? THREE.DoubleSide : source.side,
    transparent: Boolean(source.transparent && !isFoliage),
    vertexColors: Boolean(source.vertexColors),
  });

  material.name = `ToonLab nature · ${role} · ${source.name || 'material'}`;
  material.depthTest = source.depthTest;
  material.depthWrite = isFoliage ? true : source.depthWrite;
  material.fog = source.fog;
  material.polygonOffset = source.polygonOffset;
  material.polygonOffsetFactor = source.polygonOffsetFactor;
  material.polygonOffsetUnits = source.polygonOffsetUnits;
  material.toneMapped = source.toneMapped;

  copyTextureTransform(material.map, source.map);
  copyTextureTransform(material.alphaMap, source.alphaMap);

  const lighting = settings.lighting;
  const family = isFoliage ? settings.foliage : settings.bark;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.toonlabNatureShadowTint = {
      value: new THREE.Color().setRGB(
        ...lighting.shadowTint,
        THREE.SRGBColorSpace,
      ),
    };
    shader.uniforms.toonlabNatureShadowTintStrength = {
      value: lighting.shadowTintStrength,
    };
    shader.uniforms.toonlabNatureRimStrength = {
      value: lighting.rimStrength + (family.rimStrength ?? 0),
    };
    shader.uniforms.toonlabNatureRimPower = {
      value: lighting.rimPower,
    };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
        #include <common>
        uniform vec3 toonlabNatureShadowTint;
        uniform float toonlabNatureShadowTintStrength;
        uniform float toonlabNatureRimStrength;
        uniform float toonlabNatureRimPower;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
        float toonlabNatureBaseLuma = max(
          dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)),
          0.025
        );
        float toonlabNatureOutputLuma = dot(
          gl_FragColor.rgb,
          vec3(0.2126, 0.7152, 0.0722)
        );
        float toonlabNatureShadow = 1.0 - smoothstep(
          0.42,
          0.92,
          toonlabNatureOutputLuma / toonlabNatureBaseLuma
        );
        gl_FragColor.rgb *= mix(
          vec3(1.0),
          toonlabNatureShadowTint,
          toonlabNatureShadow * toonlabNatureShadowTintStrength * 0.24
        );
        float toonlabNatureRim = pow(
          1.0 - saturate(abs(dot(
            normalize(normal),
            normalize(-vViewPosition)
          ))),
          toonlabNatureRimPower
        );
        gl_FragColor.rgb += toonlabNatureShadowTint
          * toonlabNatureRim
          * toonlabNatureRimStrength
          * 0.16;
        #include <dithering_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => (
    `toonlab-imported-vegetation-v1-${role}`
  );
  material.userData.toonlabImportedVegetation = {
    profile: settings,
    sourceMaterial: source.name || '',
  };

  return tagVegetationMaterial(material, {
    role,
    variant: isFoliage
      ? VEGETATION_MATERIAL_VARIANTS.cutout
      : VEGETATION_MATERIAL_VARIANTS.mesh,
  });
}
