import * as THREE from 'three';

import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  abs,
  clamp,
  float,
  luminance,
  max,
  mix,
  normalMap as normalMapNode,
  normalWorld,
  positionWorld,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';

import { projectedWaterCaustics } from '../shaders-tsl/chunks/projected-water-caustics.js';
import { getWaterFoamTexture } from './waterFoamTexture.js';
import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';

const DEFAULT_FOAM_COLOR = Object.freeze([0.94, 0.98, 1.0]);
const DEFAULT_WET_DARKENING = 0.3;
const DEFAULT_WET_ROUGHNESS = 0.28;
const DEFAULT_WET_CLEARCOAT = 0.68;
const DEFAULT_FOAM_AMOUNT = 1;
const DRY_ROUGHNESS = 0.95;

const regionScratch = new THREE.Vector4();
let fallbackStateTexture = null;

function getFallbackStateTexture() {
  if (!fallbackStateTexture) {
    // R moisture, G surface film, B active foam, A stranded residue.
    fallbackStateTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat,
    );
    fallbackStateTexture.name = 'waterShoreStateFallback';
    fallbackStateTexture.colorSpace = THREE.NoColorSpace;
    fallbackStateTexture.minFilter = THREE.LinearFilter;
    fallbackStateTexture.magFilter = THREE.LinearFilter;
    fallbackStateTexture.wrapS = THREE.ClampToEdgeWrapping;
    fallbackStateTexture.wrapT = THREE.ClampToEdgeWrapping;
    fallbackStateTexture.generateMipmaps = false;
    fallbackStateTexture.needsUpdate = true;
  }
  return fallbackStateTexture;
}

function resolveStateTexture(stateField) {
  const candidate = stateField?.texture
    ?? stateField?.stateTexture
    ?? stateField?.renderTarget?.texture
    ?? stateField?.target?.texture;
  return candidate?.isTexture ? candidate : getFallbackStateTexture();
}

function copyRegion(out, value) {
  if (value?.isVector4) return out.copy(value);
  if (Array.isArray(value)) {
    return out.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0.5, value[3] ?? 0.5);
  }
  if (value && typeof value === 'object') {
    const width = Number(value.width);
    const depth = Number(value.depth);
    const halfWidth = value.halfWidth ?? value.halfSizeX
      ?? (Number.isFinite(width) ? width * 0.5 : 0.5);
    const halfDepth = value.halfDepth ?? value.halfSizeZ
      ?? (Number.isFinite(depth) ? depth * 0.5 : 0.5);
    return out.set(
      value.centerX ?? value.x ?? 0,
      value.centerZ ?? value.z ?? 0,
      halfWidth,
      halfDepth,
    );
  }
  return out.set(0, 0, 0.5, 0.5);
}

function resolveStateRegion(stateField, out) {
  if (!stateField) return out.set(0, 0, 0.5, 0.5);
  if (typeof stateField.getRegion === 'function') {
    out.set(0, 0, 0.5, 0.5);
    const result = stateField.getRegion(out);
    return result && result !== out ? copyRegion(out, result) : out;
  }
  if (stateField.region || stateField.worldRegion) {
    return copyRegion(out, stateField.region ?? stateField.worldRegion);
  }
  return out.set(
    stateField.centerX ?? 0,
    stateField.centerZ ?? 0,
    Math.max((stateField.worldWidth ?? stateField.width ?? 1) * 0.5, 1e-3),
    Math.max((stateField.worldDepth ?? stateField.depth ?? 1) * 0.5, 1e-3),
  );
}

function setSrgbColor(uniformNode, value) {
  if (value === undefined) return;
  if (value?.isColor) {
    uniformNode.value.copy(value);
    return;
  }
  if (Array.isArray(value)) {
    uniformNode.value.setRGB(
      value[0] ?? 1,
      value[1] ?? 1,
      value[2] ?? 1,
      THREE.SRGBColorSpace,
    );
    return;
  }
  uniformNode.value.set(value);
}

function setFiniteClamped(uniformNode, value, min, maximum) {
  if (!Number.isFinite(value)) return;
  uniformNode.value = THREE.MathUtils.clamp(value, min, maximum);
}

/**
 * Refreshes the live state binding and appearance controls of a persistent
 * shore material. Call once after each shore-state ping-pong swap; changing a
 * TextureNode's value updates the binding without rebuilding the node graph.
 */
export function updateWaterShoreMaterial(material, {
  stateField,
  foamColor,
  foamAmount,
  wetDarkening,
  wetRoughness,
  wetClearcoat,
} = {}) {
  const uniforms = material?.uniforms;
  if (!uniforms?.uShoreStateMap) return material;

  if (stateField !== undefined) material.userData.waterShoreStateField = stateField;
  const field = material.userData.waterShoreStateField ?? null;
  uniforms.uShoreStateMap.value = resolveStateTexture(field);
  uniforms.uShoreFoamCoordinates.value = field?.foamCoordinateTexture ?? getFallbackStateTexture();
  if (uniforms.uShoreSolvedDepth) uniforms.uShoreSolvedDepth.value = field?.isWaterDynamics ? 1 : 0;
  if (uniforms.uShoreContinuation) uniforms.uShoreContinuation.value.set(
    field?.level ?? 0, field?.options?.renderExtent && field?.mode === 'coast' ? 1 : 0,
  );
  resolveStateRegion(field, regionScratch);
  uniforms.uShoreStateRegion.value.copy(regionScratch);

  setSrgbColor(uniforms.uShoreFoamColor, foamColor);
  setFiniteClamped(uniforms.uShoreFoamAmount, foamAmount, 0, 2);
  setFiniteClamped(uniforms.uShoreWetDarkening, wetDarkening, 0, 1);
  setFiniteClamped(uniforms.uShoreWetRoughness, wetRoughness, 0.04, 1);
  setFiniteClamped(uniforms.uShoreWetClearcoat, wetClearcoat, 0, 1);
  return material;
}

/**
 * Creates a lit wettable ground material for shoreline meshes whose base
 * albedo lives in the geometry's `color` attribute.
 *
 * Packed state channels:
 * - R: persistent sediment moisture
 * - G: short-lived surface water film
 * - B: active aerated foam
 * - A: stranded/drying foam residue
 *
 * The vertex color is sampled explicitly so foam can blend toward its actual
 * albedo instead of merely multiplying dark wet sand. Automatic vertex-color
 * modulation is disabled below to avoid applying the base twice.
 */
export function createWaterShoreMaterial({
  albedoMap = null,
  armMap = null,
  normalMap = null,
  textureRepeat = 1,
  stateField = null,
  foamColor = DEFAULT_FOAM_COLOR,
  foamAmount = DEFAULT_FOAM_AMOUNT,
  wetDarkening = DEFAULT_WET_DARKENING,
  wetRoughness = DEFAULT_WET_ROUGHNESS,
  wetClearcoat = DEFAULT_WET_CLEARCOAT,
} = {}) {
  const uniforms = {
    uShoreStateMap: texture(getFallbackStateTexture()),
    uShoreFoamCoordinates: texture(getFallbackStateTexture()),
    uShoreFoamBubbles: texture(getWaterFoamTexture()),
    uShoreSolvedDepth: uniform(0),
    uShoreContinuation: uniform(new THREE.Vector2(0,0)),
    // (centerX, centerZ, halfWidth, halfDepth), matching the ripple-region
    // convention used by the rest of the water system.
    uShoreStateRegion: uniform(new THREE.Vector4(0, 0, 0.5, 0.5)),
    uShoreFoamColor: uniform(new THREE.Color(1, 1, 1)),
    uShoreFoamAmount: uniform(DEFAULT_FOAM_AMOUNT),
    uShoreWetDarkening: uniform(DEFAULT_WET_DARKENING),
    uShoreWetRoughness: uniform(DEFAULT_WET_ROUGHNESS),
    uShoreWetClearcoat: uniform(DEFAULT_WET_CLEARCOAT),
  };

  const fieldUv = positionWorld.xz
    .sub(uniforms.uShoreStateRegion.xy)
    .div(max(uniforms.uShoreStateRegion.zw.mul(2.0), vec2(1e-3)))
    .add(0.5);
  const insideX = step(0.0, fieldUv.x).mul(step(fieldUv.x, 1.0));
  const inside = mix(insideX,1.0,uniforms.uShoreContinuation.y)
    .mul(step(0.0, fieldUv.y)).mul(step(fieldUv.y, 1.0));
  // State render targets have no mip chain. Explicit level zero is required
  // by WGSL in non-uniform control flow and is harmless on the GLSL builder.
  const rawState = uniforms.uShoreStateMap
    .sample(clamp(fieldUv, vec2(0.0), vec2(1.0)))
    .level(0);
  const state = rawState.mul(inside);
  const boundedUv=clamp(fieldUv,vec2(0),vec2(1));
  const foamCoordinates=uniforms.uShoreFoamCoordinates.sample(boundedUv).level(0).rg
    .add(fieldUv.sub(boundedUv).mul(uniforms.uShoreStateRegion.zw).mul(2));
  const foamBubbles=uniforms.uShoreFoamBubbles.sample(foamCoordinates.div(.72));

  // Submerged continuation cannot suddenly become dry sand at the atlas
  // boundary. Carry boundary moisture outward, tending to rest submersion.
  const outside = max(abs(positionWorld.xz.sub(uniforms.uShoreStateRegion.xy))
    .sub(uniforms.uShoreStateRegion.zw),vec2(0.0));
  const nearBoundary = smoothstep(0.0,80.0,max(outside.x,outside.y)).oneMinus();
  const restWet = smoothstep(0.002,0.04,uniforms.uShoreContinuation.x.sub(positionWorld.y));
  const continuationWet = max(restWet,rawState.r.mul(nearBoundary))
    .mul(inside.oneMinus()).mul(uniforms.uShoreContinuation.y);

  const moisture = clamp(max(state.r,continuationWet), 0.0, 1.0);
  const film = clamp(max(mix(state.g, state.g.div(0.04), uniforms.uShoreSolvedDepth),continuationWet), 0.0, 1.0);
  const foamAmountNode = clamp(uniforms.uShoreFoamAmount, 0.0, 2.0);
  const activeFoam = clamp(state.b, 0.0, 1.0);
  const residue = clamp(state.a, 0.0, 1.0);
  const presentedActiveFoam = activeFoam.mul(foamAmountNode);
  const presentedResidue = residue.mul(foamAmountNode);

  // Optional tiling detail lets authored lab/showcase terrain use this same
  // persistent wet-sand material without weakening its vertex-painted depth
  // tint. ARM follows the Poly Haven convention (AO, roughness, metalness).
  // The maps are fixed when the graph is created; wetness/foam remain live.
  const hasTiledMaps = albedoMap?.isTexture || armMap?.isTexture || normalMap?.isTexture;
  const tiledUv = hasTiledMaps
    ? uv().mul(Math.max(Number(textureRepeat) || 1, 1e-3))
    : null;
  const vertexBaseColor = vertexColor().rgb;
  const armSample = armMap?.isTexture ? texture(armMap).sample(tiledUv) : null;
  const albedoSample = albedoMap?.isTexture
    ? texture(albedoMap).sample(tiledUv).rgb
    : null;
  const albedoLuminance = albedoSample ? luminance(albedoSample) : null;
  const sandContrast = albedoLuminance
    ? clamp(albedoLuminance.mul(1.7).add(0.48), 0.72, 1.24)
    : null;
  const sandChroma = albedoSample
    ? albedoSample.div(max(albedoLuminance, float(0.08)))
    : null;
  const dryBaseColor = albedoSample
    ? mix(
      vertexBaseColor,
      clamp(
        vertexBaseColor
          .mul(sandContrast)
          .mul(mix(vec3(1.0), sandChroma, 0.18)),
        0.0,
        1.0,
      ),
      0.86,
    )
    : vertexBaseColor;
  const dryRoughness = armSample
    ? mix(float(0.82), float(1.0), armSample.g)
    : float(DRY_ROUGHNESS);

  // Damp sand darkens substantially but remains saturated. Exposed active
  // foam must still read after the thin water geometry has retreated, so blend
  // toward the physical foam albedo; residue receives a quieter contribution.
  const wetScale = float(1.0).sub(moisture.mul(uniforms.uShoreWetDarkening));
  const wetBaseColor = dryBaseColor.mul(wetScale);
  // The water mesh is deliberately clipped at the signed swash head. The
  // same temporal state extends about one source-cell onto exposed wet sand,
  // so render coherent active foam here as the thin sand-side half of the
  // shoreline lace. Without this shared fringe the water material can only
  // show the wet-side half and every raft looks cut off by the mesh edge.
  // Keep a firm onset so weak advected state still cannot become the broad
  // grey clouds that an earlier raw-state blend produced.
  const visibleActiveFoam = smoothstep(0.46, 0.68, activeFoam);
  const visibleResidue = smoothstep(0.3, 0.68, residue);
  const foamCoverage = clamp(
    visibleActiveFoam.mul(0.72).add(visibleResidue.mul(0.12)).mul(foamAmountNode),
    0.0,
    0.74,
  ).mul(mix(1.0, smoothstep(0.0001, 0.0015, state.g).oneMinus().mul(foamBubbles.g.mul(.7).add(.3)), uniforms.uShoreSolvedDepth));
  const receiverVisibility = sampleEnvironmentSunShadow(positionWorld)
    .mul(sampleEnvironmentCloudShadow(positionWorld, 1))
    .toVar();
  const shadowTint = mix(
    vec3(0.44, 0.62, 0.76),
    vec3(1.0),
    receiverVisibility,
  );
  const shadowedFoamColor = uniforms.uShoreFoamColor.mul(shadowTint).mul(mix(1,foamBubbles.r,uniforms.uShoreSolvedDepth));
  const shoreColor = mix(wetBaseColor, shadowedFoamColor, foamCoverage)
    .mul(shadowTint);

  // Saturated grains remain mostly diffuse; the fresh micron-thin film owns
  // the sharp gloss. Aerated/stranded foam pushes the lobe back toward matte.
  const gloss = max(film, moisture.mul(0.24));
  const foamRoughness = clamp(
    presentedActiveFoam.mul(0.72).add(presentedResidue.mul(0.32)),
    0.0,
    1.0,
  );
  const roughness = mix(dryRoughness, uniforms.uShoreWetRoughness, gloss);
  const clearcoatOcclusion = clamp(
    presentedActiveFoam.mul(0.72).add(presentedResidue.mul(0.18)),
    0.0,
    0.88,
  )
    .oneMinus();

  const material = new MeshPhysicalNodeMaterial({ vertexColors: false });
  material.name = 'WaterShoreMaterial';
  material.colorNode = shoreColor;
  // Focused sunlight is extra incident illumination, not a brighter sand
  // pigment. Keeping it out of albedo preserves its contrast under tone
  // mapping and avoids multiplying it by the ordinary sun a second time.
  material.emissiveNode = shoreColor.mul(
    projectedWaterCaustics(positionWorld, normalWorld).mul(receiverVisibility),
  );
  material.metalnessNode = float(0.0);
  material.roughnessNode = mix(roughness, float(0.88), foamRoughness);
  if (armSample) material.aoNode = mix(float(0.9), float(1.0), armSample.r);
  if (normalMap?.isTexture) {
    material.normalNode = normalMapNode(
      texture(normalMap).sample(tiledUv).rgb,
      vec2(0.24, 0.24),
    );
  }
  material.clearcoatNode = film.mul(uniforms.uShoreWetClearcoat).mul(clearcoatOcclusion);
  material.clearcoatRoughnessNode = mix(0.32, 0.1, film);
  material.specularIntensityNode = mix(0.5, 1.0, film);
  material.uniforms = uniforms;
  material.userData.waterShoreMaterial = true;
  material.userData.waterShoreStateField = stateField;

  return updateWaterShoreMaterial(material, {
    stateField,
    foamColor,
    foamAmount,
    wetDarkening,
    wetRoughness,
    wetClearcoat,
  });
}
