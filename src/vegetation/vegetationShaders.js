// Vegetation shader authoring has three public layers:
//
// 1. TREE_SHADER_PROFILE / GRASS_SHADER_PROFILE / FLOWER_SHADER_PROFILE are
//    the canonical authoring profiles. They share one implementation and
//    semantic material contract, but serialize independently so a style bundle
//    can tune trees, grass, and flowers without replacing each other.
// 2. VEGETATION_SHADER is the shared family foundation and compatibility
//    aggregate. Three historical global foliage-palette fields remain only so
//    v1 aggregate documents can load; canonical Tree/Flower profiles exclude
//    them. Current light/weather/wind values, construction settings, textures,
//    and interaction-field geometry never enter the shader profiles.
// 3. FOLIAGE_SHADER / GRASS_SHADER / FLOWER_SHADER / BARK_SHADER are the
//    original family APIs. They remain as compatibility adapters for existing
//    applications and saved documents.

import * as THREE from 'three';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';

export const VEGETATION_SHADER_DOCUMENT_TYPE = 'toonlab/vegetation-shader-preset';
export const VEGETATION_SHADER_SCHEMA_VERSION = 1;
export const VEGETATION_MATERIAL_CONTRACT_VERSION = 1;

export const TREE_SHADER_DOCUMENT_TYPE = 'toonlab/tree-shader-preset';
export const GRASS_SHADER_PROFILE_DOCUMENT_TYPE = 'toonlab/grass-shader-preset';
export const FLOWER_SHADER_PROFILE_DOCUMENT_TYPE = 'toonlab/flower-shader-preset';
export const TREE_SHADER_SCHEMA_VERSION = 2;
export const GRASS_SHADER_PROFILE_SCHEMA_VERSION = 1;
export const FLOWER_SHADER_PROFILE_SCHEMA_VERSION = 3;

export const VEGETATION_MATERIAL_ROLES = Object.freeze({
  foliageCard: 'foliageCard',
  flowerCenter: 'flowerCenter',
  flowerPetal: 'flowerPetal',
  grassBlade: 'grassBlade',
  herbaceousStem: 'herbaceousStem',
  woodySurface: 'woodySurface',
});

export const VEGETATION_MATERIAL_VARIANTS = Object.freeze({
  billboard: 'billboard',
  cutout: 'cutout',
  mesh: 'mesh',
  procedural: 'procedural',
});

const ALL_ROLES = Object.freeze(Object.values(VEGETATION_MATERIAL_ROLES));
const THIN_SURFACE_ROLES = Object.freeze([
  VEGETATION_MATERIAL_ROLES.grassBlade,
  VEGETATION_MATERIAL_ROLES.foliageCard,
  VEGETATION_MATERIAL_ROLES.flowerPetal,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function clampNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function srgbTriplet(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

function cloneSetting(value) {
  return Array.isArray(value) ? [...value] : value;
}

function pascalCase(value) {
  return String(value).replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g,
    (_match, _separator, char) => char.toUpperCase());
}

function field({
  defaultValue,
  description,
  label,
  range = null,
  roles = null,
  type = 'number',
  integer = false,
}) {
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? Object.freeze([...defaultValue]) : defaultValue,
    description,
    integer,
    label,
    range: range ? Object.freeze({ ...range }) : null,
    roles: Object.freeze([...(roles ?? ALL_ROLES)]),
    type,
  });
}

// Every exposed field has a uniform contract, even before every material
// variant implements it. applyVegetationShader reports missing uniforms so a
// lab can never imply that a control changed a material when it did not.
const GROUP_DEFINITIONS = Object.freeze({
  lighting: Object.freeze({
    description: 'IP-wide light and shadow treatment shared by every vegetation surface.',
    label: 'Shared Lighting',
    fields: Object.freeze({
      shadowTint: field({
        defaultValue: [0.36, 0.4, 0.58],
        description: 'Cool treatment tint mixed into shadowed vegetation without replacing its albedo.',
        label: 'Shadow Tint',
        type: 'color',
      }),
      shadowTintStrength: field({
        defaultValue: 1,
        description: 'Strength of the shared shadow tint treatment.',
        label: 'Shadow Tint Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      sunTintStrength: field({
        defaultValue: 0.25,
        description: 'How strongly the active sun color tints lit vegetation.',
        label: 'Sun Tint Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      skyFillStrength: field({
        defaultValue: 0.08,
        description: 'Shared sky-color fill in unlit vegetation regions.',
        label: 'Sky Fill Strength',
        range: { max: 0.5, min: 0, step: 0.005 },
      }),
      rimStrength: field({
        defaultValue: 0.12,
        description: 'View-dependent silhouette fill shared by vegetation surfaces.',
        label: 'Rim Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      rimPower: field({
        defaultValue: 3,
        description: 'Falloff exponent of the shared vegetation rim.',
        label: 'Rim Power',
        range: { max: 12, min: 0.5, step: 0.1 },
      }),
    }),
  }),
  thinSurface: Object.freeze({
    description: 'Lighting shared by thin blades, leaf cards, and petals.',
    label: 'Thin Surfaces',
    fields: Object.freeze({
      diffuseWrap: field({
        defaultValue: 0.5,
        description: 'Wraps direct light around thin surfaces so back faces remain readable.',
        label: 'Diffuse Wrap',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionStrength: field({
        defaultValue: 0.35,
        description: 'Shared sunlight transmission through blades, leaves, and petals.',
        label: 'Transmission Strength',
        range: { max: 2, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionPower: field({
        defaultValue: 3.5,
        description: 'Angular concentration of thin-surface transmission.',
        label: 'Transmission Power',
        range: { max: 12, min: 0.5, step: 0.1 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionShadowFloor: field({
        defaultValue: 0.35,
        description: 'Minimum transmission that remains inside cast or cloud shadow.',
        label: 'Transmission Shadow Floor',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      normalUpBias: field({
        defaultValue: 0,
        description: 'Biases thin-surface shading normals toward world up.',
        label: 'Normal Up Bias',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      twoSidedLighting: field({
        defaultValue: 1,
        description: 'Blends back-face normals into the shared thin-surface lighting model.',
        label: 'Two-Sided Lighting',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
    }),
  }),
  weatherResponse: Object.freeze({
    description: 'How the IP shades wetness and snow; current weather amounts remain scene-owned.',
    label: 'Weather Response',
    fields: Object.freeze({
      wetDarkening: field({
        defaultValue: 0.15,
        description: 'Maximum albedo darkening applied by wetness.',
        label: 'Wet Darkening',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      wetDesaturation: field({
        defaultValue: 0.05,
        description: 'Maximum desaturation applied by wetness.',
        label: 'Wet Desaturation',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      wetHighlightStrength: field({
        defaultValue: 0.2,
        description: 'Stylized highlight added to wet vegetation.',
        label: 'Wet Highlight Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      snowTint: field({
        defaultValue: [0.92, 0.96, 1],
        description: 'Vegetation-domain multiplier over the selected shared Snow Surface profile. The Snow Surface shader owns the base powder and shadow colors.',
        label: 'Snow Tint Multiplier',
        type: 'color',
      }),
      snowShadowStrength: field({
        defaultValue: 0.65,
        description: 'Vegetation-domain light visibility retained over the shared Snow Surface shadow body.',
        label: 'Snow Light Visibility',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      snowEdgeSoftness: field({
        defaultValue: 0.2,
        description: 'Softness of snow coverage transitions.',
        label: 'Snow Edge Softness',
        range: { max: 1, min: 0, step: 0.01 },
      }),
    }),
  }),
  grass: Object.freeze({
    description: 'Grass-only color, surface, lighting, dense-field, gust, and bend treatment.',
    label: 'Grass',
    fields: Object.freeze({
      styleColorStrength: field({ defaultValue: 0, description: 'Blend from asset-authored blade color to the style-owned root and tip treatment.', label: 'Style Color Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      baseColor: field({ defaultValue: [0.16, 0.34, 0.08], description: 'Style-owned anime grass-root color.', label: 'Root Color', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipBrightness: field({ defaultValue: 0.1, description: 'Brightness added to root color before the blade-tip saturation and hue treatment.', label: 'Tip Brightness', range: { max: 1, min: -1, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipDesaturation: field({ defaultValue: -0.35, description: 'Tip desaturation. Negative values increase saturation for a graphic anime gradient.', label: 'Tip Desaturation', range: { max: 1, min: -1, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipHueShift: field({ defaultValue: -0.06, description: 'Normalized HSV hue rotation applied to blade tips.', label: 'Tip Hue Shift', range: { max: 1, min: -1, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      roughness: field({ defaultValue: 0.5, description: 'Grass surface roughness used by the stylized highlight response.', label: 'Roughness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      specularStrength: field({ defaultValue: 0.04, description: 'Grass direct-light highlight strength.', label: 'Specular', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      emissiveStrength: field({ defaultValue: 0, description: 'Albedo-relative emission before scene exposure.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      backlitStrength: field({ defaultValue: 0.4, description: 'Grass transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      sceneShadowResponse: field({ defaultValue: 0.7, description: 'Grass response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      cloudShadowResponse: field({ defaultValue: 0.35, description: 'Grass response to the scene cloud-shadow field.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bandThreshold: field({ defaultValue: 0.49, description: 'Center of the grass direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bandSoftness: field({ defaultValue: 0.1, description: 'Width of the grass direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      shadowFloor: field({ defaultValue: 0.35, description: 'Minimum grass brightness in full shadow.', label: 'Shadow Floor', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      rootOcclusionStrength: field({ defaultValue: 0.36, description: 'Dense-field darkening at blade roots.', label: 'Root Occlusion Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      rootOcclusionHeight: field({ defaultValue: 0.62, description: 'Blade height over which root occlusion fades.', label: 'Root Occlusion Height', range: { max: 1, min: 0.01, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipGradientStart: field({ defaultValue: 0.1, description: 'Blade fraction where the root-to-tip material gradient begins.', label: 'Tip Gradient Start', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipGradientEnd: field({ defaultValue: 0.95, description: 'Blade fraction where the root-to-tip material gradient completes.', label: 'Tip Gradient End', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      colorVariationStrength: field({ defaultValue: 0.2, description: 'Seeded blade luminance variation.', label: 'Color Variation Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      gustSheenThreshold: field({ defaultValue: 0.78, description: 'Gust value where the blade-tip sheen begins.', label: 'Gust Sheen Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      gustSheenStrength: field({ defaultValue: 0.22, description: 'Strength of the moving gust sheen.', label: 'Gust Sheen Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bendExponent: field({ defaultValue: 2, description: 'Root-to-tip curve used by wind and interaction deformation.', label: 'Bend Exponent', range: { max: 6, min: 0.5, step: 0.05 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      interactionResponse: field({ defaultValue: 1, description: 'Grass deformation response to a scene-owned interaction field.', label: 'Interaction Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
    }),
  }),
  foliage: Object.freeze({
    description: 'Leaf-card gradient shaping, surface, subsurface, and canopy-volume treatment over the asset-authored foliage palette.',
    label: 'Foliage',
    fields: Object.freeze({
      // These three fields remain in the aggregate v1 compatibility schema so
      // older vegetation documents can still be read. Canonical Tree/Flower
      // scope documents explicitly exclude them below: species/asset recipes
      // own the foliage palette and the shader owns only its rendition.
      styleColorStrength: field({ defaultValue: 0, description: 'Legacy aggregate-only blend into a global replacement palette. Canonical Tree and Flower Shader profiles preserve asset-authored foliage colors.', label: 'Legacy Style Color Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      mainColor: field({ defaultValue: [0.040915, 0.135633, 0.015209], description: 'Legacy aggregate-only replacement color. Canonical profiles read the primary foliage color from the asset or species recipe.', label: 'Legacy Main Color', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      gradientColor: field({ defaultValue: [0.076185, 0.198069, 0.016807], description: 'Legacy aggregate-only replacement color. Canonical profiles read the secondary foliage color from the asset or species recipe.', label: 'Legacy Gradient Color', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      gradientOffset: field({ defaultValue: 0.088, description: 'Offsets the normalized height transfer applied over the asset-authored foliage palette.', label: 'Gradient Offset', range: { max: 1, min: -1, step: 0.001 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      gradientContrast: field({ defaultValue: 0.821665, description: 'Shapes the normalized height transfer applied over the asset-authored foliage palette.', label: 'Gradient Contrast', range: { max: 4, min: -1, step: 0.001 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      hueVariation: field({ defaultValue: 0.1, description: 'Style-owned hue-variation amplitude; the stable per-card seed remains asset or instance data.', label: 'Hue Variation Amount', range: { max: 1, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      hueShift: field({ defaultValue: 0, description: 'Style-wide normalized HSV rotation applied after resolving the asset-authored foliage palette.', label: 'Style Hue Shift', range: { max: 1, min: -1, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      roughness: field({ defaultValue: 0.75, description: 'Roughness of the stylized leaf highlight response over any asset-authored surface inputs.', label: 'Highlight Roughness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      specularStrength: field({ defaultValue: 0.1, description: 'Leaf direct-light highlight strength.', label: 'Specular', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      emissiveStrength: field({ defaultValue: 0.25, description: 'Albedo-relative leaf emission before scene exposure.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      subsurfaceStrength: field({ defaultValue: 0.8, description: 'Strength of foliage back-light transmission.', label: 'Subsurface Strength', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      subsurfaceOpacity: field({ defaultValue: 0.3, description: 'Opacity retained by foliage transmission.', label: 'Subsurface Opacity', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      backlitStrength: field({ defaultValue: 0.35, description: 'Foliage transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      sceneShadowResponse: field({ defaultValue: 0.55, description: 'Foliage response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      cloudShadowResponse: field({ defaultValue: 0, description: 'Foliage response to the scene cloud-shadow field.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      bandThreshold: field({ defaultValue: 0.47, description: 'Center of the foliage direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      bandSoftness: field({ defaultValue: 0.18, description: 'Width of the foliage direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crestThreshold: field({ defaultValue: 0.72, description: 'Center of the high crown-color crest band.', label: 'Crest Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crestSoftness: field({ defaultValue: 0.12, description: 'Width of the high crown-color crest band.', label: 'Crest Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crownOcclusionStrength: field({ defaultValue: 0.2, description: 'Additional darkening inside renderer-shadowed crowns.', label: 'Crown Occlusion Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      spriteLuminanceStrength: field({ defaultValue: 0.36, description: 'Influence of painted leaf-sprite luminance.', label: 'Sprite Luminance Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      cardVariationStrength: field({ defaultValue: 0.16, description: 'Seeded per-card luminance variation.', label: 'Card Variation Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      transmissionPowerMultiplier: field({ defaultValue: 1, description: 'Foliage multiplier over the shared thin-surface transmission concentration.', label: 'Transmission Power Multiplier', range: { max: 3, min: 0.25, step: 0.05 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
    }),
  }),
  flower: Object.freeze({
    description: 'Shared petal/center cutout, surface, lighting, and subsurface treatment across flower variants.',
    label: 'Flower',
    fields: Object.freeze({
      textureTint: field({ defaultValue: [1, 1, 1], description: 'Legacy aggregate-only replacement tint. Canonical Flower Shader profiles preserve the asset/species petal and center palette.', label: 'Legacy Flower Tint', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      tintStrength: field({ defaultValue: 1, description: 'Legacy aggregate-only strength for the replacement flower tint.', label: 'Legacy Flower Tint Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      roughness: field({ defaultValue: 0.5, description: 'Flower surface roughness used by the stylized highlight response.', label: 'Roughness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      specularStrength: field({ defaultValue: 0.05, description: 'Flower direct-light highlight strength.', label: 'Specular', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      emissiveStrength: field({ defaultValue: 0, description: 'Albedo-relative flower emission before scene exposure.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      subsurfaceStrength: field({ defaultValue: 0.3, description: 'Strength of petal back-light transmission.', label: 'Subsurface Strength', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      subsurfaceOpacity: field({ defaultValue: 0.08, description: 'Opacity retained by petal transmission.', label: 'Subsurface Opacity', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      backlitStrength: field({ defaultValue: 0.35, description: 'Petal transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      sceneShadowResponse: field({ defaultValue: 0.85, description: 'Flower response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      bandThreshold: field({ defaultValue: 0.5, description: 'Center of the flower direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      bandSoftness: field({ defaultValue: 0.1, description: 'Width of the flower direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      unlitPetalLift: field({ defaultValue: 0.35, description: 'Petal-tinted floor for unlit petal faces.', label: 'Unlit Petal Lift', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      cupDarkeningStrength: field({ defaultValue: 0.1, description: 'Stylized darkening toward curved petal edges.', label: 'Cup Darkening Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      petalTransmissionMultiplier: field({ defaultValue: 1, description: 'Flower-family multiplier over shared thin-surface transmission.', label: 'Petal Transmission Multiplier', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      centerLightResponse: field({ defaultValue: 0.8, description: 'Direct-light response of flower centers relative to petals.', label: 'Center Light Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      centerShadowResponse: field({ defaultValue: 1, description: 'Shadow response of flower centers relative to petals.', label: 'Center Shadow Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerCenter] }),
    }),
  }),
  bark: Object.freeze({
    description: 'Opaque woody color, texture projection, surface, and lighting treatment for trunks, branches, and roots.',
    label: 'Bark / Woody Surface',
    fields: Object.freeze({
      tint: field({ defaultValue: [0.938, 0.3752, 0], description: 'Style tint mixed over the asset-authored bark color.', label: 'Tint', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      tintStrength: field({ defaultValue: 0, description: 'Strength of the bark style tint.', label: 'Tint Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      roughness: field({ defaultValue: 1, description: 'Bark roughness used by the stylized highlight response.', label: 'Roughness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      normalFlatness: field({ defaultValue: 0, description: 'Amount of asset-authored bark normal detail flattened by the style.', label: 'Normal Flatness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      emissiveStrength: field({ defaultValue: 0, description: 'Albedo-relative bark emission before scene exposure.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      bandCount: field({ defaultValue: 3, description: 'Cel bands across the woody light-to-shadow ramp.', integer: true, label: 'Band Count', range: { max: 6, min: 2, step: 1 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      bandSoftness: field({ defaultValue: 0, description: 'Continuous softness of woody toon-band transitions.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      shadowFloor: field({ defaultValue: 0.35, description: 'Minimum brightness of a fully shadowed woody surface.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      sunTintStrength: field({ defaultValue: 0.15, description: 'Sun-color tint applied to lit bark.', label: 'Sun Tint Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      skyFillStrength: field({ defaultValue: 0.04, description: 'Sky-color fill applied to shaded bark.', label: 'Sky Fill Strength', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      rimStrength: field({ defaultValue: 0, description: 'View-dependent woody silhouette fill.', label: 'Rim Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      specularStrength: field({ defaultValue: 0, description: 'Stylized bark highlight strength.', label: 'Specular Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      verticalShadeStrength: field({ defaultValue: 0, description: 'World-up gradient used to ground trunks without changing their albedo.', label: 'Vertical Shade Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
    }),
  }),
  stem: Object.freeze({
    description: 'Smooth herbaceous stem surface and lighting treatment, intentionally separate from woody bark.',
    label: 'Herbaceous Stem',
    fields: Object.freeze({
      color: field({ defaultValue: [0.155926, 0.332452, 0.066626], description: 'Legacy aggregate-only replacement color. Canonical Flower Shader profiles read herbaceous stem color from the plant asset/species recipe.', label: 'Legacy Stem Color', type: 'color', roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      colorStrength: field({ defaultValue: 0, description: 'Legacy aggregate-only blend into the replacement stem color.', label: 'Legacy Stem Color Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      roughness: field({ defaultValue: 0.5, description: 'Stem surface roughness used by the stylized highlight response.', label: 'Roughness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      specularStrength: field({ defaultValue: 0.05, description: 'Stem direct-light highlight strength.', label: 'Specular', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      emissiveStrength: field({ defaultValue: 0, description: 'Albedo-relative stem emission before scene exposure.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      bandCount: field({ defaultValue: 3, description: 'Cel bands across herbaceous stems.', integer: true, label: 'Band Count', range: { max: 6, min: 2, step: 1 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      bandSoftness: field({ defaultValue: 0.08, description: 'Softness of herbaceous stem toon bands.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      shadowFloor: field({ defaultValue: 0.42, description: 'Minimum brightness of a fully shadowed stem.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      transmissionStrength: field({ defaultValue: 0.08, description: 'Subtle light transmission through green stems.', label: 'Transmission Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      skyFillStrength: field({ defaultValue: 0.06, description: 'Additional stem sky-color fill over the shared vegetation fill.', label: 'Additional Sky Fill', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      rimStrength: field({ defaultValue: 0.02, description: 'View-dependent stem silhouette fill.', label: 'Rim Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
    }),
  }),
});

/**
 * Vegetation is one implementation family with three authored surface
 * profiles. Lighting, thin-surface response, and weather response come from
 * one shared base by default. Scope documents still carry a portable snapshot
 * of those groups; a future explicit split/override mode may replace that
 * snapshot for one profile without changing the base ownership model.
 */
export const VEGETATION_SHADER_SCOPES = Object.freeze({
  tree: Object.freeze({
    description: 'Tree canopy foliage plus bark, trunks, branches, and other woody surfaces.',
    documentType: TREE_SHADER_DOCUMENT_TYPE,
    excludedFields: Object.freeze([
      'foliage.styleColorStrength',
      'foliage.mainColor',
      'foliage.gradientColor',
    ]),
    groups: Object.freeze([
      'lighting',
      'thinSurface',
      'weatherResponse',
      'foliage',
      'bark',
    ]),
    id: 'tree',
    label: 'Tree Shader',
    previewMode: 'tree',
    schemaVersion: TREE_SHADER_SCHEMA_VERSION,
    roles: Object.freeze([
      VEGETATION_MATERIAL_ROLES.foliageCard,
      VEGETATION_MATERIAL_ROLES.woodySurface,
    ]),
  }),
  grass: Object.freeze({
    description: 'Grass blades and groundcover thin surfaces, including dense-field and interaction response.',
    documentType: GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
    groups: Object.freeze([
      'lighting',
      'thinSurface',
      'weatherResponse',
      'grass',
    ]),
    id: 'grass',
    label: 'Grass Shader',
    previewMode: 'grass',
    schemaVersion: GRASS_SHADER_PROFILE_SCHEMA_VERSION,
    roles: Object.freeze([
      VEGETATION_MATERIAL_ROLES.grassBlade,
    ]),
  }),
  flower: Object.freeze({
    description: 'Flower petals, centers, leaves, and herbaceous stems.',
    documentType: FLOWER_SHADER_PROFILE_DOCUMENT_TYPE,
    excludedFields: Object.freeze([
      'foliage.styleColorStrength',
      'foliage.mainColor',
      'foliage.gradientColor',
      'flower.textureTint',
      'flower.tintStrength',
      'stem.color',
      'stem.colorStrength',
    ]),
    groups: Object.freeze([
      'lighting',
      'thinSurface',
      'weatherResponse',
      'foliage',
      'flower',
      'stem',
    ]),
    id: 'flower',
    label: 'Flower Shader',
    previewMode: 'flower',
    schemaVersion: FLOWER_SHADER_PROFILE_SCHEMA_VERSION,
    roles: Object.freeze([
      VEGETATION_MATERIAL_ROLES.foliageCard,
      VEGETATION_MATERIAL_ROLES.flowerPetal,
      VEGETATION_MATERIAL_ROLES.flowerCenter,
      VEGETATION_MATERIAL_ROLES.herbaceousStem,
    ]),
  }),
});

export const VEGETATION_SHADER_SCOPE_IDS = Object.freeze(
  Object.keys(VEGETATION_SHADER_SCOPES),
);

export const VEGETATION_SHADER_SCOPE_EXCLUDED_FIELDS = Object.freeze({
  tree: Object.freeze([
    Object.freeze({
      owner: 'asset',
      path: 'foliage.mainColor',
      replacement: 'tree recipe tree.canopyColor / tree.canopyPalette',
      reason: 'Primary foliage color identifies the species or authored tree variant.',
    }),
    Object.freeze({
      owner: 'asset',
      path: 'foliage.gradientColor',
      replacement: 'tree recipe tree.canopyPalette',
      reason: 'Secondary foliage color belongs to the asset-authored canopy palette.',
    }),
    Object.freeze({
      owner: 'compatibility',
      path: 'foliage.styleColorStrength',
      replacement: 'asset palette plus foliage.hueShift when a style-wide transform is required',
      reason: 'A global replacement blend silently overwrites every tree species.',
    }),
  ]),
  flower: Object.freeze([
    Object.freeze({
      owner: 'asset',
      path: 'foliage.mainColor',
      replacement: 'flower/plant recipe foliage palette',
      reason: 'Attached-leaf color identifies the authored plant asset.',
    }),
    Object.freeze({
      owner: 'asset',
      path: 'foliage.gradientColor',
      replacement: 'flower/plant recipe foliage palette',
      reason: 'Attached-leaf gradient color belongs to the authored plant asset.',
    }),
    Object.freeze({
      owner: 'compatibility',
      path: 'foliage.styleColorStrength',
      replacement: 'asset palette plus foliage.hueShift when a style-wide transform is required',
      reason: 'A global replacement blend silently overwrites every plant species.',
    }),
    Object.freeze({
      owner: 'asset',
      path: 'flower.textureTint',
      replacement: 'flower/plant recipe petal and center palette or authored flower texture',
      reason: 'Petal and center colors identify the flower species or authored plant variant.',
    }),
    Object.freeze({
      owner: 'compatibility',
      path: 'flower.tintStrength',
      replacement: 'asset palette plus a future explicit instance/style color-transform layer',
      reason: 'A global replacement-tint blend silently recolors every flower species.',
    }),
    Object.freeze({
      owner: 'asset',
      path: 'stem.color',
      replacement: 'flower/plant recipe stem color or authored stem texture',
      reason: 'The herbaceous base color is botanical asset data, not a reusable lighting treatment.',
    }),
    Object.freeze({
      owner: 'compatibility',
      path: 'stem.colorStrength',
      replacement: 'asset stem color plus a future explicit instance/style color-transform layer',
      reason: 'A replacement-color blend silently overwrites every plant species.',
    }),
  ]),
  grass: Object.freeze([]),
});

export const VEGETATION_SHARED_SHADER_GROUP_IDS = Object.freeze([
  'lighting',
  'thinSurface',
  'weatherResponse',
]);

export const VEGETATION_SHADER_SETTING_GROUPS = Object.freeze(
  Object.entries(GROUP_DEFINITIONS).map(([id, group]) => Object.freeze({
    description: group.description,
    id,
    label: group.label,
  })),
);

const fieldSchema = {};
const defaultSettings = {};
const uniformByField = {};
for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
  const fields = {};
  const defaults = {};
  for (const [key, definition] of Object.entries(group.fields)) {
    const path = `${groupId}.${key}`;
    const uniform = `uStyle${pascalCase(groupId)}${pascalCase(key)}`;
    defaults[key] = cloneSetting(definition.defaultValue);
    uniformByField[path] = uniform;
    fields[key] = Object.freeze({
      defaultValue: cloneSetting(definition.defaultValue),
      description: definition.description,
      group: groupId,
      id: path,
      key,
      label: definition.label,
      range: definition.range,
      roles: definition.roles,
      serializable: true,
      type: definition.type,
      uniform,
    });
  }
  fieldSchema[groupId] = Object.freeze(fields);
  defaultSettings[groupId] = Object.freeze(defaults);
}

export const VEGETATION_SHADER_FIELD_SCHEMA = Object.freeze(fieldSchema);
export const DEFAULT_VEGETATION_SHADER_SETTINGS = Object.freeze(defaultSettings);
export const VEGETATION_SHADER_UNIFORM_BY_FIELD = Object.freeze(uniformByField);

const vegetationShaderPresets = new Map();

function sanitizeVegetationField(value, definition, fallback) {
  if (definition.type === 'color') return srgbTriplet(value, fallback);
  const number = clampNumber(value, fallback, definition.range ?? {});
  return definition.integer ? Math.round(number) : number;
}

function normalizePresetId(value) {
  const id = String(value ?? '').trim();
  return id || 'default';
}

/** Resolves one complete, plain IP-wide vegetation shader settings object. */
export function createVegetationShaderSettings(options = {}) {
  const source = typeof options === 'string' ? { preset: options } : cleanObject(options);
  const presetId = normalizePresetId(source.preset);
  const preset = vegetationShaderPresets.get(presetId) ?? vegetationShaderPresets.get('default');
  const base = preset?.settings ?? DEFAULT_VEGETATION_SHADER_SETTINGS;
  const input = isPlainObject(source.settings) ? source.settings : source;
  const settings = {};
  for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
    const groupInput = cleanObject(input[groupId]);
    const resolvedGroup = {};
    for (const [key, definition] of Object.entries(group.fields)) {
      const fallback = base[groupId]?.[key] ?? definition.defaultValue;
      resolvedGroup[key] = sanitizeVegetationField(
        groupInput[key] !== undefined ? groupInput[key] : fallback,
        definition,
        fallback,
      );
    }
    settings[groupId] = resolvedGroup;
  }
  return settings;
}

function collectUnknownVegetationFields(settings) {
  const warnings = [];
  for (const [groupId, value] of Object.entries(cleanObject(settings))) {
    if (!GROUP_DEFINITIONS[groupId]) {
      warnings.push(`Unknown vegetation shader group "${groupId}" was ignored.`);
      continue;
    }
    for (const key of Object.keys(cleanObject(value))) {
      if (!GROUP_DEFINITIONS[groupId].fields[key]) {
        warnings.push(`Unknown vegetation shader field "${groupId}.${key}" was ignored.`);
      }
    }
  }
  return warnings;
}

/** Validates a canonical VegetationShaderProfile document. */
export function validateVegetationShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid vegetation shader preset JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isPlainObject(source)) {
    return { errors: ['Vegetation shader preset must be a JSON object.'], ok: false, value: null, warnings: [] };
  }

  const errors = [];
  const warnings = [];
  if (source.type !== VEGETATION_SHADER_DOCUMENT_TYPE) {
    errors.push(`Vegetation shader preset type must be "${VEGETATION_SHADER_DOCUMENT_TYPE}".`);
  }
  const rawVersion = source.version ?? source.schemaVersion;
  const version = rawVersion === undefined ? VEGETATION_SHADER_SCHEMA_VERSION : Math.round(Number(rawVersion));
  if (rawVersion === undefined) warnings.push(`Vegetation shader preset version was missing and defaulted to ${VEGETATION_SHADER_SCHEMA_VERSION}.`);
  if (!Number.isFinite(version)) errors.push('Vegetation shader preset version must be a number.');
  else if (version > VEGETATION_SHADER_SCHEMA_VERSION) {
    errors.push(`Vegetation shader preset version ${version} is newer than supported version ${VEGETATION_SHADER_SCHEMA_VERSION}.`);
  }

  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Vegetation shader preset id is required.');
  const settingsInput = cleanObject(source.settings);
  warnings.push(...collectUnknownVegetationFields(settingsInput));
  const value = errors.length === 0 ? {
    description: String(source.description ?? ''),
    id,
    label: String(source.label || id),
    settings: createVegetationShaderSettings(settingsInput),
    type: VEGETATION_SHADER_DOCUMENT_TYPE,
    version: VEGETATION_SHADER_SCHEMA_VERSION,
  } : null;
  return { errors, ok: errors.length === 0, value, warnings };
}

export function parseVegetationShaderPresetDocument(input) {
  return validateVegetationShaderPresetDocument(input);
}

export function createVegetationShaderPresetDocument(id, definition = {}) {
  const source = cleanObject(definition);
  const document = {
    description: source.description ?? '',
    id: id ?? source.id,
    label: source.label ?? id ?? source.id,
    settings: createVegetationShaderSettings(source.settings ?? source),
    type: VEGETATION_SHADER_DOCUMENT_TYPE,
    version: VEGETATION_SHADER_SCHEMA_VERSION,
  };
  const result = validateVegetationShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeVegetationShaderPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = isPlainObject(idOrDocument) && idOrDocument.type === VEGETATION_SHADER_DOCUMENT_TYPE
    ? createVegetationShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createVegetationShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerVegetationShaderPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createVegetationShaderPresetDocument(id, definition);
  if (overwrite && isProtectedSystemStyleId(document.id) && vegetationShaderPresets.has(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (!overwrite && vegetationShaderPresets.has(document.id)) {
    throw new Error(`Vegetation shader preset "${document.id}" already exists.`);
  }
  vegetationShaderPresets.set(document.id, {
    description: document.description,
    label: document.label,
    settings: document.settings,
  });
  return { description: document.description, id: document.id, label: document.label, value: document.id };
}

export function registerSerializedVegetationShaderPreset(input, options = {}) {
  const result = parseVegetationShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerVegetationShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getVegetationShaderPresetOptions() {
  return [...vegetationShaderPresets.entries()].map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
    value: id,
  }));
}

export function resolveVegetationShaderPreset(id = 'default', overrides = {}) {
  return createVegetationShaderSettings({ ...cleanObject(overrides), preset: normalizePresetId(id) });
}

function requireVegetationShaderScope(scopeId) {
  const scope = VEGETATION_SHADER_SCOPES[String(scopeId ?? '')];
  if (!scope) {
    throw new Error(
      `Unknown vegetation shader scope "${scopeId}". Expected ${VEGETATION_SHADER_SCOPE_IDS.join(', ')}.`,
    );
  }
  return scope;
}

export function getVegetationShaderScopeSettingGroups(scopeId) {
  const scope = requireVegetationShaderScope(scopeId);
  return VEGETATION_SHADER_SETTING_GROUPS.filter(({ id }) => scope.groups.includes(id));
}

export function getVegetationShaderScopeExcludedFields(scopeId) {
  const scope = requireVegetationShaderScope(scopeId);
  return VEGETATION_SHADER_SCOPE_EXCLUDED_FIELDS[scope.id] ?? Object.freeze([]);
}

export function getVegetationShaderScopeFieldSchema(scopeId) {
  const scope = requireVegetationShaderScope(scopeId);
  const excluded = new Set(scope.excludedFields ?? []);
  return Object.freeze(Object.fromEntries(
    scope.groups.map((groupId) => [groupId, Object.freeze(Object.fromEntries(
      Object.entries(VEGETATION_SHADER_FIELD_SCHEMA[groupId])
        .filter(([key]) => !excluded.has(`${groupId}.${key}`)),
    ))]),
  ));
}

/**
 * Resolve only the settings owned by one canonical vegetation shader profile.
 * The returned object can be passed directly to vegetation materials because
 * their uniform layer supplies defaults for groups outside that material role.
 */
export function createVegetationShaderScopeSettings(scopeId, options = {}) {
  const scope = requireVegetationShaderScope(scopeId);
  const schema = getVegetationShaderScopeFieldSchema(scope.id);
  const resolved = createVegetationShaderSettings(options);
  return Object.fromEntries(scope.groups.map((groupId) => [
    groupId,
    Object.fromEntries(Object.keys(schema[groupId]).map((key) => (
      [key, cloneSetting(resolved[groupId][key])]
    ))),
  ]));
}

/** Resolve the editable base shared by Tree, Grass, and Flower shaders. */
export function createVegetationSharedShaderSettings(options = {}) {
  const resolved = createVegetationShaderSettings(options);
  return Object.fromEntries(VEGETATION_SHARED_SHADER_GROUP_IDS.map((groupId) => [
    groupId,
    Object.fromEntries(Object.entries(resolved[groupId]).map(([key, value]) => [
      key,
      cloneSetting(value),
    ])),
  ]));
}

export function isVegetationSharedShaderGroup(groupId) {
  return VEGETATION_SHARED_SHADER_GROUP_IDS.includes(String(groupId ?? ''));
}

/**
 * Resolve a scope profile against one shared vegetation base.
 *
 * Shared values intentionally win over the document's embedded snapshot. The
 * snapshot keeps exports portable; it is not an implicit per-profile split.
 */
export function mergeVegetationSharedShaderSettings(
  scopeId,
  profileSettings = {},
  sharedSettings = {},
) {
  const scoped = createVegetationShaderScopeSettings(scopeId, profileSettings);
  const shared = createVegetationSharedShaderSettings(sharedSettings);
  return {
    ...scoped,
    ...shared,
  };
}

export function validateVegetationShaderScopePresetDocument(scopeId, input) {
  const scope = requireVegetationShaderScope(scopeId);
  const scopeSchema = getVegetationShaderScopeFieldSchema(scope.id);
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid ${scope.label} preset JSON: ${error.message}`],
        ok: false,
        value: null,
        warnings: [],
      };
    }
  }
  if (!isPlainObject(source)) {
    return {
      errors: [`${scope.label} preset must be a JSON object.`],
      ok: false,
      value: null,
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];
  if (source.type !== scope.documentType) {
    errors.push(`${scope.label} preset type must be "${scope.documentType}".`);
  }
  const rawVersion = source.version ?? source.schemaVersion;
  const version = rawVersion === undefined
    ? scope.schemaVersion
    : Math.round(Number(rawVersion));
  if (rawVersion === undefined) {
    warnings.push(
      `${scope.label} preset version was missing and defaulted to ${scope.schemaVersion}.`,
    );
  }
  if (!Number.isFinite(version)) errors.push(`${scope.label} preset version must be a number.`);
  else if (version > scope.schemaVersion) {
    errors.push(
      `${scope.label} preset version ${version} is newer than supported version ${scope.schemaVersion}.`,
    );
  }

  const id = String(source.id ?? '').trim();
  if (!id) errors.push(`${scope.label} preset id is required.`);
  const settingsInput = cleanObject(source.settings);
  for (const [groupId, groupInput] of Object.entries(settingsInput)) {
    if (!scope.groups.includes(groupId)) {
      warnings.push(
        `${scope.label} does not own vegetation shader group "${groupId}"; it was ignored.`,
      );
      continue;
    }
    for (const key of Object.keys(cleanObject(groupInput))) {
      const path = `${groupId}.${key}`;
      if (scopeSchema[groupId]?.[key]) continue;
      const excluded = getVegetationShaderScopeExcludedFields(scope.id)
        .find((entry) => entry.path === path);
      if (excluded) {
        warnings.push(
          `${scope.label} v${scope.schemaVersion} does not serialize ${path}; ` +
          `${excluded.owner} owns it. Move it to ${excluded.replacement}.`,
        );
      } else {
        warnings.push(`Unknown ${scope.label} field "${path}" was ignored.`);
      }
    }
  }

  const value = errors.length === 0 ? {
    description: String(source.description ?? ''),
    id,
    label: String(source.label || id),
    scope: scope.id,
    settings: createVegetationShaderScopeSettings(scope.id, settingsInput),
    type: scope.documentType,
    version: scope.schemaVersion,
  } : null;
  return { errors, ok: errors.length === 0, value, warnings };
}

export function parseVegetationShaderScopePresetDocument(scopeId, input) {
  return validateVegetationShaderScopePresetDocument(scopeId, input);
}

export function createVegetationShaderScopePresetDocument(scopeId, id, definition = {}) {
  const scope = requireVegetationShaderScope(scopeId);
  const source = cleanObject(definition);
  const result = validateVegetationShaderScopePresetDocument(scope.id, {
    description: source.description ?? '',
    id: id ?? source.id,
    label: source.label ?? id ?? source.id,
    scope: scope.id,
    settings: createVegetationShaderScopeSettings(
      scope.id,
      source.settings ?? source,
    ),
    type: scope.documentType,
    version: scope.schemaVersion,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeVegetationShaderScopePreset(
  scopeId,
  idOrDocument,
  definition = {},
  { pretty = true } = {},
) {
  const scope = requireVegetationShaderScope(scopeId);
  const document = isPlainObject(idOrDocument) && idOrDocument.type === scope.documentType
    ? createVegetationShaderScopePresetDocument(scope.id, idOrDocument.id, idOrDocument)
    : createVegetationShaderScopePresetDocument(scope.id, idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export const createTreeShaderSettings = (options = {}) => (
  createVegetationShaderScopeSettings('tree', options)
);
export const createGrassShaderProfileSettings = (options = {}) => (
  createVegetationShaderScopeSettings('grass', options)
);
export const createFlowerShaderProfileSettings = (options = {}) => (
  createVegetationShaderScopeSettings('flower', options)
);
export const createTreeShaderPresetDocument = (id, definition = {}) => (
  createVegetationShaderScopePresetDocument('tree', id, definition)
);
export const createGrassShaderProfilePresetDocument = (id, definition = {}) => (
  createVegetationShaderScopePresetDocument('grass', id, definition)
);
export const createFlowerShaderProfilePresetDocument = (id, definition = {}) => (
  createVegetationShaderScopePresetDocument('flower', id, definition)
);
export const parseTreeShaderPresetDocument = (input) => (
  parseVegetationShaderScopePresetDocument('tree', input)
);
export const parseGrassShaderProfilePresetDocument = (input) => (
  parseVegetationShaderScopePresetDocument('grass', input)
);
export const parseFlowerShaderProfilePresetDocument = (input) => (
  parseVegetationShaderScopePresetDocument('flower', input)
);

// Register the baseline before resolving any other preset.
registerVegetationShaderPreset('default', {
  description: 'Complete baseline vegetation shader treatment.',
  label: 'Default',
});
registerVegetationShaderPreset('call_me_sensei', {
  description: 'Studio-managed anime vegetation treatment coordinated across trees, grass, and flowers.',
  label: 'Call Me Sensei',
  settings: {
    bark: {
      bandCount: 3,
      emissiveStrength: 0,
      normalFlatness: 0,
      roughness: 1,
      shadowFloor: 0.42,
      skyFillStrength: 0.04,
      specularStrength: 0.04,
      tint: [0.938, 0.3752, 0],
      tintStrength: 0.08,
    },
    flower: {
      emissiveStrength: 0,
      roughness: 0.5,
      specularStrength: 0.05,
      subsurfaceOpacity: 0.08,
      subsurfaceStrength: 0.3,
      textureTint: [1, 1, 1],
      tintStrength: 1,
      unlitPetalLift: 0.4,
    },
    foliage: {
      backlitStrength: 0.28,
      cloudShadowResponse: 0.68,
      crestSoftness: 0.08,
      crestThreshold: 0.84,
      crownOcclusionStrength: 0.24,
      emissiveStrength: 0,
      gradientColor: [0.076185, 0.198069, 0.016807],
      gradientContrast: 0.821665,
      gradientOffset: 0.088,
      hueShift: 0,
      // The per-card seed already supplies useful variation. A 0.1 hue
      // amplitude spans ±36°, turning one botanical palette into lime/cyan
      // confetti; keep the signature style inside a controlled species range.
      hueVariation: 0.025,
      mainColor: [0.040915, 0.135633, 0.015209],
      roughness: 0.75,
      sceneShadowResponse: 0.72,
      specularStrength: 0.1,
      styleColorStrength: 1,
      subsurfaceOpacity: 0.42,
      subsurfaceStrength: 0.48,
    },
    grass: {
      backlitStrength: 0.76,
      baseColor: [0.28, 0.52, 0.14],
      bendExponent: 1.3,
      cloudShadowResponse: 0.28,
      colorVariationStrength: 0.08,
      emissiveStrength: 0.16,
      rootOcclusionStrength: 0,
      roughness: 0.5,
      sceneShadowResponse: 0.12,
      shadowFloor: 0.92,
      specularStrength: 0.04,
      styleColorStrength: 1,
      tipBrightness: 0.25,
      tipDesaturation: 0,
      tipHueShift: 0,
    },
    lighting: {
      rimStrength: 0.16,
      shadowTint: [0.72, 0.8, 1.0],
      shadowTintStrength: 0.42,
      skyFillStrength: 0.16,
    },
    stem: {
      color: [0.155926, 0.332452, 0.066626],
      colorStrength: 1,
      emissiveStrength: 0,
      roughness: 0.5,
      shadowFloor: 0.56,
      skyFillStrength: 0.1,
      specularStrength: 0.05,
    },
    thinSurface: { transmissionShadowFloor: 0.55 },
  },
});

export const VEGETATION_SHADER = Object.freeze({
  createDocument: createVegetationShaderPresetDocument,
  createSettings: createVegetationShaderSettings,
  defaults: DEFAULT_VEGETATION_SHADER_SETTINGS,
  description: 'Shared vegetation-family implementation and compatibility aggregate.',
  documentType: VEGETATION_SHADER_DOCUMENT_TYPE,
  fieldSchema: VEGETATION_SHADER_FIELD_SCHEMA,
  getPresetOptions: getVegetationShaderPresetOptions,
  id: 'vegetation',
  label: 'Vegetation Shader',
  registerPreset: registerVegetationShaderPreset,
  validateDocument: validateVegetationShaderPresetDocument,
});

function defineScopedVegetationShaderMaster(scopeId) {
  const scope = requireVegetationShaderScope(scopeId);
  return Object.freeze({
    createDocument: (id, definition = {}) => (
      createVegetationShaderScopePresetDocument(scope.id, id, definition)
    ),
    createSettings: (options = {}) => (
      createVegetationShaderScopeSettings(scope.id, options)
    ),
    defaults: createVegetationShaderScopeSettings(scope.id),
    description: scope.description,
    documentType: scope.documentType,
    fieldSchema: getVegetationShaderScopeFieldSchema(scope.id),
    getPresetOptions: getVegetationShaderPresetOptions,
    groups: getVegetationShaderScopeSettingGroups(scope.id),
    id: scope.id,
    label: scope.label,
    roles: scope.roles,
    schemaVersion: scope.schemaVersion,
    excludedFields: getVegetationShaderScopeExcludedFields(scope.id),
    validateDocument: (input) => validateVegetationShaderScopePresetDocument(scope.id, input),
  });
}

export const TREE_SHADER_PROFILE = defineScopedVegetationShaderMaster('tree');
export const GRASS_SHADER_PROFILE = defineScopedVegetationShaderMaster('grass');
export const FLOWER_SHADER_PROFILE = defineScopedVegetationShaderMaster('flower');

export const VEGETATION_SHADER_FAMILY = Object.freeze({
  description:
    'Shared vegetation renderer family with independently authored tree, grass, and flower profiles.',
  id: 'vegetation',
  label: 'Vegetation Shader Family',
  profiles: Object.freeze([
    TREE_SHADER_PROFILE,
    GRASS_SHADER_PROFILE,
    FLOWER_SHADER_PROFILE,
  ]),
});

/**
 * Marks a material as a semantic vegetation consumer. Technical variants are
 * metadata only; creative treatment is selected by role.
 */
export function tagVegetationMaterial(material, {
  role,
  roles = null,
  variant = VEGETATION_MATERIAL_VARIANTS.mesh,
} = {}) {
  if (!material || typeof material !== 'object') throw new Error('tagVegetationMaterial needs a material.');
  const resolvedRoles = [...new Set([
    ...(role === undefined || role === null ? [] : [role]),
    ...(Array.isArray(roles) ? roles : (roles === undefined || roles === null ? [] : [roles])),
  ].map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  if (resolvedRoles.length === 0) throw new Error('Vegetation material role is required.');
  const unknownRole = resolvedRoles.find((entry) => !ALL_ROLES.includes(entry));
  if (unknownRole) throw new Error(`Unknown vegetation material role "${unknownRole}".`);
  const resolvedVariant = String(variant ?? '').trim();
  if (!resolvedVariant) throw new Error('Vegetation material variant is required.');
  material.userData = material.userData ?? {};
  material.userData.toonlabVegetation = {
    // `role` remains the primary-role compatibility surface. `roles` is the
    // canonical capability list for composite materials such as a flower head
    // whose one draw call shades both petals and its center.
    role: resolvedRoles[0],
    roles: resolvedRoles,
    variant: resolvedVariant,
    version: VEGETATION_MATERIAL_CONTRACT_VERSION,
  };
  return material;
}

export function getVegetationMaterialContract(material) {
  const contract = material?.userData?.toonlabVegetation;
  if (!isPlainObject(contract)) return null;
  const roles = [...new Set([
    ...(contract.role === undefined || contract.role === null ? [] : [contract.role]),
    ...(Array.isArray(contract.roles) ? contract.roles : []),
  ].map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  return {
    role: roles[0] ?? '',
    roles,
    variant: String(contract.variant ?? ''),
    version: Number(contract.version),
  };
}

function collectMaterials(target, output, seenObjects = new Set()) {
  if (!target) return;
  if (Array.isArray(target)) {
    for (const entry of target) collectMaterials(entry, output, seenObjects);
    return;
  }
  if (target.isMaterial || (target.uniforms && target.userData)) {
    output.add(target);
    return;
  }
  if (seenObjects.has(target)) return;
  seenObjects.add(target);
  const materials = Array.isArray(target.material) ? target.material : [target.material];
  for (const material of materials) if (material) output.add(material);
  if (typeof target.traverse === 'function') {
    target.traverse((object) => {
      if (object === target) return;
      const nested = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of nested) if (material) output.add(material);
    });
  }
}

function writeStyleUniform(uniformNode, value) {
  if (!uniformNode || !('value' in uniformNode)) return false;
  if (Array.isArray(value)) {
    if (uniformNode.value?.isColor) {
      uniformNode.value.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
    } else if (typeof uniformNode.value?.fromArray === 'function') {
      uniformNode.value.fromArray(value);
    } else {
      uniformNode.value = [...value];
    }
  } else {
    uniformNode.value = value;
  }
  return true;
}

function fieldsForRole(role) {
  const fields = [];
  for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
    for (const [key, definition] of Object.entries(group.fields)) {
      if (!definition.roles.includes(role)) continue;
      fields.push({
        groupId,
        key,
        path: `${groupId}.${key}`,
        uniform: VEGETATION_SHADER_UNIFORM_BY_FIELD[`${groupId}.${key}`],
      });
    }
  }
  return fields;
}

function fieldsForRoles(roles) {
  const fields = new Map();
  for (const role of roles) {
    for (const descriptor of fieldsForRole(role)) {
      const existing = fields.get(descriptor.path);
      if (existing) existing.roles.push(role);
      else fields.set(descriptor.path, { ...descriptor, roles: [role] });
    }
  }
  return [...fields.values()];
}

/** Returns the profile slice a semantic material role is required to consume. */
export function resolveVegetationShaderRoleSettings(role, profile = {}) {
  if (!ALL_ROLES.includes(role)) throw new Error(`Unknown vegetation material role "${role}".`);
  const resolved = createVegetationShaderSettings(profile);
  const result = {};
  for (const descriptor of fieldsForRole(role)) {
    result[descriptor.groupId] = result[descriptor.groupId] ?? {};
    result[descriptor.groupId][descriptor.key] = cloneSetting(
      resolved[descriptor.groupId][descriptor.key],
    );
  }
  return result;
}

/**
 * Applies one unified shader profile to tagged materials under Object3Ds or in
 * material arrays. Unsupported fields are reported rather than silently
 * pretending that a material consumed them.
 */
export function applyVegetationShader(
  rootOrArray,
  profile = {},
  { fields = null, roles = null } = {},
) {
  const resolved = createVegetationShaderSettings(profile);
  const allowedFields = fields === null
    ? null
    : new Set((Array.isArray(fields) ? fields : [fields]).map(String));
  const allowedRoles = roles === null
    ? null
    : new Set((Array.isArray(roles) ? roles : [roles]).map(String));
  const materials = new Set();
  collectMaterials(rootOrArray, materials);
  const report = {
    applied: 0,
    matched: 0,
    roles: {},
    skipped: 0,
    unsupported: [],
    visited: materials.size,
    warnings: [],
    writes: 0,
  };

  for (const material of materials) {
    const contract = getVegetationMaterialContract(material);
    if (!contract) {
      report.skipped += 1;
      continue;
    }
    if (
      contract.version !== VEGETATION_MATERIAL_CONTRACT_VERSION
      || contract.roles.length === 0
      || contract.roles.some((role) => !ALL_ROLES.includes(role))
    ) {
      report.skipped += 1;
      report.warnings.push(`Material "${material.name || material.uuid || 'unnamed'}" has an invalid vegetation role contract.`);
      continue;
    }
    if (allowedRoles && contract.roles.some((role) => !allowedRoles.has(role))) {
      report.skipped += 1;
      report.warnings.push(
        `Material "${material.name || material.uuid || 'unnamed'}" has role ` +
        `"${contract.roles.find((role) => !allowedRoles.has(role))}" outside this shader profile.`,
      );
      continue;
    }

    report.matched += 1;
    for (const role of contract.roles) {
      const roleReport = report.roles[role] ?? {
        applied: 0,
        matched: 0,
        variants: [],
        writes: 0,
      };
      roleReport.matched += 1;
      if (!roleReport.variants.includes(contract.variant)) roleReport.variants.push(contract.variant);
      report.roles[role] = roleReport;
    }

    let materialWrites = 0;
    const roleWrites = Object.fromEntries(contract.roles.map((role) => [role, 0]));
    for (const descriptor of fieldsForRoles(contract.roles)) {
      if (allowedFields && !allowedFields.has(descriptor.path)) continue;
      const uniformNode = material.uniforms?.[descriptor.uniform];
      if (!writeStyleUniform(uniformNode, resolved[descriptor.groupId][descriptor.key])) {
        report.unsupported.push({
          field: descriptor.path,
          material: material.name || material.uuid || 'unnamed',
          role: descriptor.roles[0],
          roles: descriptor.roles,
          uniform: descriptor.uniform,
          variant: contract.variant,
        });
        continue;
      }
      materialWrites += 1;
      for (const role of descriptor.roles) {
        roleWrites[role] += 1;
        report.roles[role].writes += 1;
      }
      report.writes += 1;
    }
    if (materialWrites > 0) {
      report.applied += 1;
      for (const role of contract.roles) {
        if (roleWrites[role] > 0) report.roles[role].applied += 1;
      }
    }
  }

  if (report.matched === 0) report.warnings.push('No tagged vegetation materials matched this profile.');
  else if (report.applied === 0) report.warnings.push('Tagged vegetation materials matched, but none implement the canonical style uniforms.');
  return report;
}

export function applyVegetationShaderScope(rootOrArray, scopeId, profile = {}) {
  const scope = requireVegetationShaderScope(scopeId);
  const fields = Object.values(getVegetationShaderScopeFieldSchema(scope.id))
    .flatMap((group) => Object.values(group).map(({ id }) => id));
  return applyVegetationShader(
    rootOrArray,
    createVegetationShaderScopeSettings(scope.id, profile),
    { fields, roles: scope.roles },
  );
}

// ---------------------------------------------------------------------------
// Legacy family APIs. Kept stable for existing applications and documents.

/** Generic legacy master registry: schema + presets + settings/doc plumbing. */
function defineLegacyMaster({ documentType, fields, id, label, description }) {
  const presets = new Map();
  const defaults = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, definition]) => [key, definition.defaultValue]),
  ));

  function createSettings(options = {}) {
    const source = isPlainObject(options) ? options : {};
    const presetName = typeof source.preset === 'string' ? source.preset : null;
    const base = presetName && presets.has(presetName)
      ? { ...defaults, ...presets.get(presetName).settings }
      : { ...defaults };
    const settings = {};
    for (const [key, definition] of Object.entries(fields)) {
      const raw = source[key] !== undefined ? source[key] : base[key];
      settings[key] = definition.type === 'color'
        ? srgbTriplet(raw, defaults[key])
        : clampNumber(raw, base[key], definition.range ?? {});
    }
    return settings;
  }

  function registerPreset(name, { label: presetLabel, settings = {} } = {}, { overwrite = false } = {}) {
    const key = String(name ?? '').trim();
    if (!key) throw new Error(`${label} preset name is required.`);
    if (!overwrite && presets.has(key)) throw new Error(`${label} preset "${key}" already exists.`);
    presets.set(key, { label: String(presetLabel ?? key), settings: createSettings(settings) });
  }

  function getPresetOptions() {
    return [...presets.entries()].map(([value, entry]) => ({ label: entry.label, value }));
  }

  function validateDocument(input) {
    const source = typeof input === 'string'
      ? (() => { try { return JSON.parse(input); } catch { return null; } })()
      : input;
    if (!isPlainObject(source)) return { errors: [`${label} shader preset must be a JSON object.`], ok: false };
    if (source.type !== documentType) return { errors: [`Document type must be "${documentType}".`], ok: false };
    const docId = String(source.id ?? '').trim();
    const docLabel = String(source.label ?? '').trim();
    if (!docId || !docLabel) return { errors: [`${label} shader preset needs an id and a label.`], ok: false };
    return { ok: true, value: { id: docId, label: docLabel, settings: createSettings(source.settings ?? {}) } };
  }

  function createDocument(docId, { label: docLabel, settings = {} } = {}) {
    return {
      id: String(docId),
      label: String(docLabel ?? docId),
      schemaVersion: VEGETATION_SHADER_SCHEMA_VERSION,
      settings: createSettings(settings),
      type: documentType,
    };
  }

  const legacyFieldSchema = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, definition]) => [key, Object.freeze({
      defaultValue: definition.defaultValue,
      description: definition.description,
      group: id,
      id: `${id}.${key}`,
      key,
      label: definition.label,
      range: definition.range ?? null,
      type: definition.type ?? 'number',
    })]),
  ));

  return Object.freeze({
    createDocument,
    createSettings,
    defaults,
    description,
    documentType,
    fieldSchema: legacyFieldSchema,
    getPresetOptions,
    id,
    label,
    registerPreset,
    validateDocument,
  });
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const FOLIAGE_SHADER = defineLegacyMaster({
  description: 'Compatibility foliage treatment adapter.',
  documentType: 'toonlab/foliage-shader',
  id: 'foliage',
  label: 'Foliage',
  fields: {
    backlitStrength: { defaultValue: 0.35, description: 'Translucent leaf glow.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 } },
    sceneShadowStrength: { defaultValue: 0.55, description: 'Renderer shadow response.', label: 'Scene Shadow Strength', range: { max: 1, min: 0, step: 0.01 } },
    cloudShadowStrength: { defaultValue: 0, description: 'Cloud-shadow response.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 } },
    alphaCutoff: { defaultValue: 0.3, description: 'Leaf sprite cutout threshold.', label: 'Alpha Cutoff', range: { max: 0.9, min: 0.05, step: 0.01 } },
  },
});

const FOLIAGE_UNIFORM_BY_FIELD = Object.freeze({
  alphaCutoff: 'uAlphaCutoff',
  backlitStrength: 'uBacklitStrength',
  cloudShadowStrength: 'uCloudShadowStrength',
  sceneShadowStrength: 'uSceneShadowStrength',
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyFoliageShader(root, settings) {
  const resolved = FOLIAGE_SHADER.createSettings(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const uniforms = material?.uniforms;
      if (!uniforms?.uBacklitStrength || !uniforms?.uSceneShadowStrength) continue;
      for (const [fieldName, uniformName] of Object.entries(FOLIAGE_UNIFORM_BY_FIELD)) {
        if (uniforms[uniformName]) uniforms[uniformName].value = resolved[fieldName];
      }
      count += 1;
    }
  });
  return count;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const GRASS_SHADER = defineLegacyMaster({
  description: 'Compatibility grass treatment adapter.',
  documentType: 'toonlab/grass-shader',
  id: 'grass',
  label: 'Grass',
  fields: {
    backlitStrength: { defaultValue: 0.4, description: 'Translucent blade glow.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 } },
    shadowStrength: { defaultValue: 0.7, description: 'Renderer shadow response.', label: 'Scene Shadow Strength', range: { max: 1, min: 0, step: 0.01 } },
    shadowTint: { defaultValue: Object.freeze([0.36, 0.4, 0.58]), description: 'Treatment shadow tint.', label: 'Shadow Tint', type: 'color' },
    cloudShadowStrength: { defaultValue: 0.35, description: 'Cloud-shadow response.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 } },
    pushRadius: { defaultValue: 0.6, description: 'Compatibility interaction radius.', label: 'Push Radius', range: { max: 2, min: 0, step: 0.02 } },
  },
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyGrassShader(fieldObject, settings) {
  const resolved = GRASS_SHADER.createSettings(settings);
  fieldObject?.applySettings?.(resolved);
  return resolved;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const FLOWER_SHADER = defineLegacyMaster({
  description: 'Compatibility 3D bloom treatment adapter.',
  documentType: 'toonlab/flower-shader',
  id: 'flower',
  label: 'Flower',
  fields: {
    unlitPetalLift: { defaultValue: 0.35, description: 'Petal-tinted unlit floor.', label: 'Unlit Petal Lift', range: { max: 1, min: 0, step: 0.01 } },
  },
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyFlowerShader(root, settings) {
  const resolved = FLOWER_SHADER.createSettings(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.uniforms?.uUnlitLift) {
        material.uniforms.uUnlitLift.value = resolved.unlitPetalLift;
        count += 1;
      }
    }
  });
  return count;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const BARK_SHADER = defineLegacyMaster({
  description: 'Compatibility MeshToonMaterial bark treatment adapter.',
  documentType: 'toonlab/bark-shader',
  id: 'bark',
  label: 'Bark',
  fields: {
    bandCount: { defaultValue: 3, description: 'Cel band count.', label: 'Band Count', range: { max: 6, min: 2, step: 1 } },
    shadowFloor: { defaultValue: 0.35, description: 'Brightness of the darkest band.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 } },
    bandSoftness: { defaultValue: 0, description: 'Compatibility toon-ramp filtering.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.05 } },
  },
});

/** Builds the legacy MeshToonMaterial gradient ramp. */
export function createBarkGradientMap(settings) {
  const resolved = BARK_SHADER.createSettings(settings);
  const steps = Math.max(2, Math.round(resolved.bandCount));
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x += 1) {
    const t = x / (width - 1);
    const stepped = Math.floor(t * (steps - 1) + 1e-6) / (steps - 1 || 1);
    const ramp = THREE.MathUtils.lerp(stepped, t, resolved.bandSoftness);
    const value = resolved.shadowFloor + (1 - resolved.shadowFloor) * ramp;
    const level = Math.round(value * 255);
    data.set([level, level, level, 255], x * 4);
  }
  const texture = new THREE.DataTexture(data, width, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyBarkShader(root, settings) {
  const gradientMap = createBarkGradientMap(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.isMeshToonMaterial) continue;
      material.gradientMap?.dispose?.();
      material.gradientMap = gradientMap;
      material.needsUpdate = true;
      count += 1;
    }
  });
  return count;
}

/** @deprecated The canonical registry is VEGETATION_SHADER. */
export const VEGETATION_SHADERS = Object.freeze([
  FOLIAGE_SHADER,
  GRASS_SHADER,
  FLOWER_SHADER,
  BARK_SHADER,
]);

for (const master of VEGETATION_SHADERS) master.registerPreset('default', { label: 'Default' });
FOLIAGE_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.5, cloudShadowStrength: 0.68, sceneShadowStrength: 0.48 },
});
GRASS_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.52, cloudShadowStrength: 0.62, shadowTint: [0.72, 0.8, 1] },
});
FLOWER_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { unlitPetalLift: 0.4 },
});
BARK_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { bandCount: 3, shadowFloor: 0.58 },
});

export const createFoliageShaderSettings = FOLIAGE_SHADER.createSettings;
export const createGrassShaderSettings = GRASS_SHADER.createSettings;
export const createFlowerShaderSettings = FLOWER_SHADER.createSettings;
export const createBarkShaderSettings = BARK_SHADER.createSettings;

const LEGACY_MASTER_BY_KEY = Object.freeze({
  bark: BARK_SHADER,
  flower: FLOWER_SHADER,
  foliage: FOLIAGE_SHADER,
  grass: GRASS_SHADER,
});

function parseLegacyDocument(value, key, errors) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      errors.push(`Invalid legacy ${key} shader JSON: ${error.message}`);
      return null;
    }
  }
  if (!isPlainObject(source)) {
    errors.push(`Legacy ${key} shader must be an object or JSON string.`);
    return null;
  }
  const master = LEGACY_MASTER_BY_KEY[key];
  if (source.type && source.type !== master.documentType) {
    errors.push(`Legacy ${key} shader type must be "${master.documentType}".`);
    return null;
  }
  return {
    id: String(source.id ?? ''),
    label: String(source.label ?? ''),
    settings: master.createSettings(source.settings ?? source),
  };
}

/**
 * Combines one or all four legacy family documents into one canonical preset.
 * Material alpha cutoff and interaction radius intentionally remain outside
 * the canonical shader profile and produce migration warnings.
 */
export function migrateLegacyVegetationShaderDocuments(input, options = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid legacy vegetation shader JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isPlainObject(source)) {
    return { errors: ['Legacy vegetation shader input must be an object.'], ok: false, value: null, warnings: [] };
  }
  if (source.type === VEGETATION_SHADER_DOCUMENT_TYPE) return validateVegetationShaderPresetDocument(source);

  const legacyKey = Object.entries(LEGACY_MASTER_BY_KEY)
    .find(([, master]) => source.type === master.documentType)?.[0];
  const documents = legacyKey ? { [legacyKey]: source } : source;
  const errors = [];
  const warnings = [];
  const settings = {};
  let firstDocument = null;

  for (const key of Object.keys(LEGACY_MASTER_BY_KEY)) {
    if (documents[key] === undefined) continue;
    const document = parseLegacyDocument(documents[key], key, errors);
    if (!document) continue;
    firstDocument = firstDocument ?? document;
    const legacy = document.settings;
    if (key === 'foliage') {
      settings.foliage = {
        backlitStrength: legacy.backlitStrength,
        cloudShadowResponse: legacy.cloudShadowStrength,
        sceneShadowResponse: legacy.sceneShadowStrength,
      };
      warnings.push('Legacy foliage alphaCutoff remains a material/texture setting and was not migrated into the shader profile.');
    } else if (key === 'grass') {
      settings.grass = {
        backlitStrength: legacy.backlitStrength,
        cloudShadowResponse: legacy.cloudShadowStrength,
        sceneShadowResponse: legacy.shadowStrength,
      };
      settings.lighting = { shadowTint: legacy.shadowTint };
      warnings.push('Legacy grass pushRadius remains an interaction-field setting and was not migrated into the shader profile.');
    } else if (key === 'flower') {
      settings.flower = { unlitPetalLift: legacy.unlitPetalLift };
    } else if (key === 'bark') {
      settings.bark = {
        bandCount: legacy.bandCount,
        bandSoftness: legacy.bandSoftness,
        shadowFloor: legacy.shadowFloor,
      };
    }
  }

  if (!firstDocument && errors.length === 0) {
    errors.push('No legacy foliage, grass, flower, or bark shader document was provided.');
  }
  if (errors.length > 0) return { errors, ok: false, value: null, warnings };

  const id = String(options.id ?? firstDocument.id ?? 'migrated-vegetation').trim();
  const label = String(options.label ?? firstDocument.label ?? id).trim();
  const value = createVegetationShaderPresetDocument(id, {
    description: options.description ?? 'Migrated from legacy vegetation family shader presets.',
    label,
    settings,
  });
  return { errors: [], ok: true, value, warnings };
}
