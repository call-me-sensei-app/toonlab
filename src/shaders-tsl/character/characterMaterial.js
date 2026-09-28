// The toon character node material (spec §5).
//
// One NodeMaterial per converted source material. Lighting is computed here
// from the shared scene-light uniforms (sceneLights.js) rather than three's
// light nodes: the look is a painted one — the lit side is the albedo under
// the light's colour, the shadow side the albedo times a display-space tone —
// so the material is unlit as far as three is concerned.
//
// Per-material inputs are uniforms named after the parameters in
// src/toon/characterParameters.js (`material.uniforms[name].value`), so a live
// retune is a uniform write. Maps and optional features are graph-build
// gates (`features`): an absent map never enters the graph.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraViewMatrix,
  cameraPosition,
  cameraProjectionMatrix,
  cameraFar,
  cameraNear,
  clamp,
  cross,
  Discard,
  dot,
  float,
  Fn,
  fract,
  frontFacing,
  fwidth,
  If,
  inverseSqrt,
  max,
  min,
  mix,
  normalize,
  normalViewGeometry,
  normalWorldGeometry,
  positionView,
  positionWorld,
  screenCoordinate,
  screenUV,
  select,
  smoothstep,
  texture,
  transformNormalToView,
  normalLocal,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
  dFdx,
  dFdy,
  hash,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { createRolesChunk } from '../chunks/character-roles.js';
import { withToonStorageSkinning } from '../chunks/character-skinning.js';
import { sampleEnvironmentSunShadowWithNormal } from '../chunks/environment-sun-shadow.js';
import { PassBasicNodeMaterial } from '../chunks/pass-depth-color.js';
import { sampleEnvironmentCloudShadow } from '../../sky/cloudShadow.js';
import { characterShadowVisibility, decodeStoredDepth, FACE_DEPTH_OFFSET, prepassDistance, screenSpaceShadowVisibility } from './castShadows.js';
import { bindMaterialToCharacterState } from './characterState.js';
import { CHARACTER_DEBUG_VIEW_IDS } from './debugViews.js';
import { displayChroma, displayMultiply, hsvToRgb, luma, maxComponent, minComponent, rgbToHsv, toDisplay, toLinear } from './displayColor.js';
import { hairRing, matcapUV, rimAmount, stylizedSpecular } from './highlightsRim.js';
import { eyeWhiteShade, noseShadow, sheerStreak } from './paintedDetails.js';
import { characterLight, limitSaturation, localLightBands, shadingDirection } from './surfaceLight.js';

const BAKE_ATTRIBUTE = 'toonBake';
const ROLE_WEIGHT_ATTRIBUTE = 'toonRoleWeights';
const WEIGHTED_SUFFIXES = [['Skin', 'skin'], ['Face', 'face'], ['Hair', 'hair']];

const SkinnedNodeMaterial = withToonStorageSkinning(NodeMaterial);

/**
 * Node material class of converted characters. `viewOffset(positionView)`,
 * when set, displaces the view-space position after skinning (outline hulls,
 * features drawn over the bangs) on every backend.
 */
export class ToonCharacterNodeMaterial extends SkinnedNodeMaterial {
  static get type() {
    return 'ToonCharacterNodeMaterial';
  }

  constructor(parameters) {
    super();
    this.isToonCharacterMaterial = true;
    this.lights = false;
    this.viewOffset = null;
    this.setValues(parameters);
  }

  setupPositionView(builder) {
    const base = super.setupPositionView(builder);
    return this.viewOffset ? base.add(this.viewOffset(base)) : base;
  }
}

// ---------------------------------------------------------------------------
// Uniforms.

function uniformFor(value) {
  if (value?.isColor) return uniform(new THREE.Vector3(value.r, value.g, value.b));
  if (value?.isVector2 || value?.isVector3 || value?.isVector4) return uniform(value.clone());
  if (Array.isArray(value)) {
    if (value.length === 2) return uniform(new THREE.Vector2(...value));
    if (value.length === 3) return uniform(new THREE.Vector3(...value));
    if (value.length === 4) return uniform(new THREE.Vector4(...value));
  }
  if (typeof value === 'boolean') return uniform(value ? 1 : 0);
  return uniform(Number.isFinite(value) ? value : 0);
}

function writeUniform(node, value) {
  if (!node || value === undefined || value === null) return;
  const current = node.value;
  if (current?.isVector2 || current?.isVector3 || current?.isVector4) {
    if (value?.isColor) current.set(value.r, value.g, value.b);
    else if (Array.isArray(value)) current.fromArray(value);
    else if (value?.isVector2 || value?.isVector3 || value?.isVector4) current.copy(value);
    return;
  }
  if (typeof value === 'boolean') node.value = value ? 1 : 0;
  else if (Number.isFinite(value)) node.value = value;
}

/** Writes parameter values into a character material's uniforms. */
export function applyCharacterParameters(material, params) {
  const uniforms = material?.uniforms;
  if (!uniforms) return 0;
  let written = 0;
  for (const [name, value] of Object.entries(params ?? {})) {
    if (!uniforms[name]) continue;
    writeUniform(uniforms[name], value);
    written += 1;
  }
  return written;
}

// Inputs every graph may read; conversion supplies real values.
const MATERIAL_INPUT_DEFAULTS = Object.freeze({
  baseAlphaStrength: 1,
  baseColor: [1, 1, 1],
  baseSaturation: 1,
  emissiveColor: [0, 0, 0],
  shellDensity: 3,
  shellSag: 0.35,
  shellLength: 0.02,
  shellRootOffset: -0.2,
  shellRootShade: 0.55,
  noseCenter: [0.5, 0.5],
  noseLeaf: [0.01, 0.01],
  outlineColorOverride: [0, 0, 0, 0],
  outlineOverrideLightingMix: 1,
  shadeColor: [1, 1, 1],
  shadeStrength: 0,
  sourceAoIntensity: 1,
  sourceMetalness: 0,
  sourceNormalScale: 1,
  stickerBlend: 0,
  stickerOffset: [0, 0],
  stickerRepeat: [1, 1],
  stickerStrength: 0,
  toneOverride: [1, 1, 1, 0],
});

// ---------------------------------------------------------------------------
// Shared helpers.

function uvNode(channel) {
  return channel === 'bake' ? attribute(BAKE_ATTRIBUTE, 'vec4').xy : uv(channel ?? 0);
}

// Role weights at this pixel (or vertex): skin, face, hair and the
// material's own role. Parameters blend by these weights.
function roleWeights(features, { vertex = false } = {}) {
  if (features.roleWeights === 'attribute') {
    const weights = attribute(ROLE_WEIGHT_ATTRIBUTE, 'vec4');
    return { face: weights.y, hair: weights.z, skin: weights.x };
  }
  if (features.roleWeights === 'mask' && features.roleMaskMap) {
    const node = texture(features.roleMaskMap, uv(0));
    const weights = vertex ? node.level(0) : node;
    return { face: weights.y, hair: weights.z, skin: weights.x };
  }
  return null;
}

function createBlend(u, weights) {
  if (!weights) return (name) => u[name];
  const own = clamp(float(1).sub(weights.skin).sub(weights.face).sub(weights.hair), 0, 1);
  return (name) => {
    let value = u[name].mul(own);
    for (const [suffix, role] of WEIGHTED_SUFFIXES) value = value.add(u[`${name}${suffix}`].mul(weights[role]));
    return value;
  };
}

function roleWeightOf(role, features, weights, name) {
  if (role === name) return float(1);
  return weights ? weights[name] : float(0);
}

function headFrame(u, state) {
  const forward = normalize(mix(state.headRestForward, state.headForward, u.faceHeadTracked));
  const upRaw = normalize(mix(state.headRestUp, state.headUp, u.faceHeadTracked));
  const right = normalize(cross(forward, upRaw));
  const up = normalize(cross(right, forward));
  return { center: state.headSphereCenter, forward, right, up };
}

// Screen-door fade (interleaved gradient noise), no sorting needed.
function ditherDiscard(u) {
  If(u.ditherOpacity.lessThan(0.999), () => {
    const pixel = screenCoordinate.xy.floor();
    const threshold = fract(fract(pixel.x.mul(0.06711056).add(pixel.y.mul(0.00583715))).mul(52.9829189));
    If(u.ditherOpacity.lessThanEqual(threshold), () => {
      Discard();
    });
  });
}

// With the depth prepass available, fragments well behind the nearest
// surface (the hair layers under the outer hair, the body under the cloth)
// are discarded before any shading: cutout materials cannot use early depth
// rejection, so this is where overdraw is saved.
function hiddenSurfaceDiscard(state, viewPosition) {
  If(state.depthReady.greaterThan(0.5), () => {
    const nearest = prepassDistance(decodeStoredDepth(state.depthMap.sample(screenUV).level(0).x).depth);
    const own = viewPosition.z.negate();
    If(own.greaterThan(nearest.add(max(own.mul(0.002), 0.004))), () => {
      Discard();
    });
  });
}

// Base texture × material colour, with the base-colour edits, decal and
// detail layers.
function albedoNodes(u, features) {
  const base = features.baseMap ? texture(features.baseMap) : vec4(1, 1, 1, 1);
  const source = base.rgb.mul(u.baseColor).toVar('toonSourceAlbedo');
  let albedo = mix(vec3(luma(source)), source, u.baseSaturation);
  if (features.vertexColors) albedo = albedo.mul(vertexColor().rgb);
  if (features.sticker?.map) {
    const decalUv = uv(features.sticker.uvChannel ?? 0).mul(u.stickerRepeat).add(u.stickerOffset);
    const decal = texture(features.sticker.map, decalUv);
    const amount = decal.a.mul(u.stickerStrength);
    const normal = mix(albedo, decal.rgb, amount);
    const add = albedo.add(decal.rgb.mul(amount));
    const multiply = mix(albedo, albedo.mul(decal.rgb), amount);
    albedo = normal.mul(select(u.stickerBlend.lessThan(0.5), float(1), float(0)))
      .add(add.mul(select(u.stickerBlend.greaterThanEqual(0.5).and(u.stickerBlend.lessThan(1.5)), float(1), float(0))))
      .add(multiply.mul(select(u.stickerBlend.greaterThanEqual(1.5), float(1), float(0))));
  }
  if (features.maps?.detailMap) {
    const detail = texture(features.maps.detailMap, uv(0).mul(u.detailRepeat)).rgb;
    albedo = albedo.mul(mix(vec3(1), detail.mul(2), u.detailStrength));
  }
  const alpha = mix(float(1), base.a, u.baseAlphaStrength);
  return { alpha, albedo: albedo.toVar('toonAlbedo'), base, source };
}

// Derivative-based tangent frame for a tangent-space normal map (world space).
function perturbNormal(u, features, normal, worldPosition) {
  const sample = texture(features.maps.normalMap).xyz.mul(2).sub(1).toVar();
  sample.xy.mulAssign(u.sourceNormalScale.mul(u.normalScale));
  const uvCoord = uv(features.maps.normalMap.channel ?? 0);
  const q0 = dFdx(worldPosition);
  const q1 = dFdy(worldPosition);
  const st0 = dFdx(uvCoord);
  const st1 = dFdy(uvCoord);
  const q1perp = cross(q1, normal);
  const q0perp = cross(normal, q0);
  const tangent = q1perp.mul(st0.x).add(q0perp.mul(st1.x));
  const bitangent = q1perp.mul(st0.y).add(q0perp.mul(st1.y));
  const det = max(dot(tangent, tangent), dot(bitangent, bitangent));
  const scale = select(det.equal(0), float(0), inverseSqrt(max(det, 1e-20)));
  const mapped = normalize(tangent.mul(sample.x.mul(scale)).add(bitangent.mul(sample.y.mul(scale))).add(normal.mul(sample.z)));
  return normalize(mix(normal, mapped, u.normalStrength));
}

// ---------------------------------------------------------------------------
// The lit surface.

function surfaceColorNode(u, features, state) {
  const role = features.role;
  return Fn(() => {
    // Shared once-nodes first (TSL: evaluate before nested helpers use them).
    const geometryNormal = normalWorldGeometry.toVar('toonGeometryNormal');
    const geometryNormalView = normalViewGeometry.toVar('toonGeometryNormalView');
    const worldPosition = positionWorld.toVar('toonWorldPosition');
    const viewPosition = positionView.toVar('toonViewPosition');
    const normal = select(frontFacing, geometryNormal, geometryNormal.negate()).toVar('toonNormal');
    const normalView = select(frontFacing, geometryNormalView, geometryNormalView.negate()).toVar('toonNormalView');
    const viewDirection = normalize(cameraPosition.sub(worldPosition)).toVar('toonViewDirection');

    // Discards only where the material needs them: a shader that may
    // discard loses early depth rejection for every fragment.
    if (features.dither) ditherDiscard(u);
    if (features.furLayer) furDiscard(u, features.furLayer);
    else if (features.cutout) hiddenSurfaceDiscard(state, viewPosition);

    const weights = roleWeights(features);
    const blend = createBlend(u, weights);
    const faceWeight = roleWeightOf(role, features, weights, 'face');
    const hairWeight = roleWeightOf(role, features, weights, 'hair');
    const ownWeight = weights
      ? clamp(float(1).sub(weights.skin).sub(weights.face).sub(weights.hair), 0, 1)
      : float(1);
    const mayBeFace = role === 'face' || Boolean(weights);
    const mayBeHair = role === 'hair' || Boolean(weights);
    const bake = features.bake?.any ? attribute(BAKE_ATTRIBUTE, 'vec4') : null;
    const head = headFrame(u, state);

    const { alpha, albedo, source } = albedoNodes(u, features);
    const { castDirection, direction: lightDirection } = shadingDirection(u);

    // Painted details modify the albedo; shading applies on top.
    const lateral = dot(lightDirection, head.right);
    if (features.noseMark && bake) {
      const nose = noseShadow(u, bake.xy, lateral);
      albedo.assign(displayMultiply(albedo, mix(vec3(1), u.noseTint, nose.shadow).mul(float(1).add(nose.highlight.mul(0.035)))));
    }
    if (features.bake?.detail === 'lid' && bake) {
      albedo.assign(displayMultiply(albedo, mix(vec3(1), u.eyeWhiteTint, eyeWhiteShade(u, bake.w))));
    }

    // Lighting normal: normal map, then the smooth head-shaped field on faces.
    let lightingNormal = normal;
    if (features.maps?.normalMap) lightingNormal = perturbNormal(u, features, normal, worldPosition);
    lightingNormal = lightingNormal.toVar('toonLightingNormal');
    if (mayBeFace) {
      const sphere = normalize(worldPosition.sub(head.center));
      const faceNormal = normalize(mix(head.forward, sphere, u.faceNormalRoundness));
      lightingNormal.assign(normalize(mix(lightingNormal, faceNormal, u.faceNormalAmount.mul(faceWeight).mul(state.headReady))));
    }

    const { light: baseLight, sky } = characterLight(u, normal);

    // Terminator: one soft step at the blended terminator.
    const bias = float(0).toVar('toonLightingBias');
    if (features.bake?.occlusion && bake) {
      bias.subAssign(blend('autoBiasStrength').mul(smoothstep(u.autoBiasStart, u.autoBiasEnd, bake.z)));
    }
    if (features.lightingMap) {
      const mapValue = dot(texture(features.lightingMap, uvNode(features.lightingMapUv)), u.lightingMapChannel);
      bias.addAssign(mapValue.sub(u.lightingMapPivot).mul(u.lightingMapScale));
    }
    const shade = dot(lightingNormal, lightDirection).add(bias).toVar('toonShade');
    const terminator = blend('terminator');
    const edge = max(blend('softness'), fwidth(shade).mul(u.antiAlias)).max(1e-4);
    const terminatorLit = smoothstep(terminator.sub(edge), terminator.add(edge), shade).toVar('toonTerminatorLit');
    const depthIntoShadow = max(terminator.sub(shade), 0).toVar('toonShadowDepth');

    // Face map: a threshold compare of the light's azimuth around the head.
    const faceMapLit = float(1).toVar('toonFaceMapLit');
    const faceMapAmount = float(0).toVar('toonFaceMapAmount');
    if (features.faceMap && mayBeFace) {
      const horizontal = lightDirection.sub(head.up.mul(dot(lightDirection, head.up)));
      const horizontalLength = horizontal.length();
      const along = horizontal.div(max(horizontalLength, 1e-4));
      const front = mix(float(1), dot(along, head.forward), smoothstep(0.02, 0.12, horizontalLength));
      const side = dot(along, head.right);
      const value = float(1).sub(front).mul(0.5);
      const coords = uvNode(features.faceMapCoords);
      const mirrored = vec2(u.faceMapMidU.mul(2).sub(coords.x), coords.y);
      const mapUv = select(side.lessThan(0).and(u.faceMapMirror.greaterThan(0.5)), mirrored, coords);
      const threshold = texture(features.faceMap, mapUv).x;
      const softness = max(u.faceMapSoftness, fwidth(threshold).mul(0.75)).max(1e-4);
      faceMapLit.assign(smoothstep(softness.negate(), softness, threshold.add(u.faceMapOffset).sub(value)));
      faceMapAmount.assign(u.faceMapStrength.mul(faceWeight).mul(state.headReady));
    }
    const lit = mix(terminatorLit, faceMapLit, faceMapAmount).toVar('toonLit');

    // Cast shadows move pixels into shadow.
    const sunShadow = sampleEnvironmentSunShadowWithNormal(worldPosition, geometryNormal).toVar('toonSunShadow');
    const cloudShadow = sampleEnvironmentCloudShadow(worldPosition, float(1)).toVar('toonCloudShadow');
    const sceneRaw = sunShadow.mul(cloudShadow).toVar('toonSceneShadowRaw');
    const sceneVisibility = mix(float(1), sceneRaw, blend('sceneShadowStrength'));
    const faceLike = role === 'eye' ? float(1) : faceWeight;
    // Cast shadows only matter where the surface is lit.
    const castGate = lit.greaterThan(0.002);
    const characterRaw = characterShadowVisibility(u, state, worldPosition, geometryNormal, faceLike, castGate);
    const characterVisibility = mix(float(1), characterRaw, blend('characterShadowStrength'));
    const screenRaw = screenSpaceShadowVisibility(u, state, viewPosition, castDirection, faceLike, castGate);
    const screenVisibility = mix(float(1), screenRaw, blend('screenShadowStrength'));
    let occlusion = float(1);
    if (features.maps?.aoMap) {
      const ao = texture(features.maps.aoMap).x;
      occlusion = mix(float(1), ao, u.aoStrength.mul(u.sourceAoIntensity).clamp(0, 1));
    }
    const occlusionVar = occlusion.toVar('toonAo');
    const castVisibility = sceneVisibility.mul(characterVisibility).mul(screenVisibility).mul(occlusionVar).toVar('toonCastVisibility');
    const litAmount = lit.mul(castVisibility).toVar('toonLitAmount');

    // Shadow colour: albedo × a display-space tone, the warmer band just
    // inside the terminator (cast-shadowed areas take the plain tone).
    const tone = blend('tone').toVar('toonTone');
    const band = blend('bandColor');
    const bandAmount = smoothstep(0.05, 0.11, displayChroma(albedo));
    const castDepth = float(1).sub(castVisibility).mul(u.bandWidth).mul(1.5);
    const bandDepth = max(depthIntoShadow.mul(float(1).sub(faceMapAmount)), castDepth);
    const plain = select(u.bandWidth.greaterThan(1e-4), smoothstep(0, max(u.bandWidth, 1e-4), bandDepth), float(1));
    const toneMultiplier = mix(mix(tone, band, bandAmount), tone, plain).toVar('toonToneMultiplier');
    if (features.rampMap) {
      const rampU = clamp(bandDepth.div(max(terminator.add(1), 0.05)), 0.005, 0.995);
      const ramp = texture(features.rampMap, vec2(rampU, 0.5)).rgb;
      toneMultiplier.assign(features.rampMapDecoded ? toDisplay(ramp) : ramp);
    }
    if (features.toneOverride) {
      toneMultiplier.assign(mix(toneMultiplier, u.toneOverride.xyz, u.toneOverride.w.mul(ownWeight)));
    }
    const shadowColor = displayMultiply(albedo, toneMultiplier).toVar('toonShadowColor');
    if (features.shadeOverride) {
      let authored = u.shadeColor;
      if (features.shadeMap) authored = authored.mul(texture(features.shadeMap).rgb);
      const capped = authored.mul(min(float(1), luma(albedo).div(max(luma(authored), 1e-4))));
      shadowColor.assign(mix(shadowColor, capped, u.shadeStrength.mul(ownWeight)));
    }

    // In the scenery's shade the light leans toward the sky's hue.
    const skyHue = sky.div(max(maxComponent(sky), 1e-4));
    const shadeLight = skyHue.mul(maxComponent(baseLight));
    const light = mix(baseLight, shadeLight, u.shadeSkyTint.mul(float(1).sub(sceneRaw)).mul(u.lightEnabled)).toVar('toonShadedLight');

    // The shadow side is lit by the light at its level but leans toward the
    // sky's hue: under a warm sun, shadows stay cool and colourful rather
    // than greyed out by the sun's colour.
    const shadowSideRaw = mix(light, skyHue.mul(maxComponent(light)), u.shadowSkyTint.mul(u.lightEnabled));
    // A saturated sky may cool the shadow side, but never turn it blue.
    const shadowSideLight = limitSaturation(shadowSideRaw, u.lightMaxTint.mul(2))
      .div(max(maxComponent(shadowSideRaw), 1e-5)).mul(maxComponent(light));
    const color = mix(shadowColor.mul(shadowSideLight), albedo.mul(light), litAmount).toVar('toonColor');

    // Local lights: their own cel bands, additive.
    const local = localLightBands(u, worldPosition, lightingNormal);
    color.addAssign(albedo.mul(local));

    // Highlights.
    const halfVector = normalize(lightDirection.add(viewDirection)).toVar('toonHalfVector');
    let specular = stylizedSpecular({
      halfVector,
      intensity: blend('specularIntensity'),
      normal: lightingNormal,
      size: blend('specularSize'),
      softness: blend('specularSoftness'),
      threshold: blend('specularThreshold'),
    });
    if (features.specularMask) {
      const mask = dot(texture(features.specularMask), u.specularMaskChannel);
      specular = specular.mul(mix(float(1), mask, u.specularMaskStrength));
    }
    if (features.maps?.roughnessMap) {
      specular = specular.mul(mix(float(1), float(1).sub(texture(features.maps.roughnessMap).y), u.roughnessStrength));
    }
    const metalness = (features.maps?.metalnessMap ? texture(features.maps.metalnessMap).z : u.sourceMetalness)
      .mul(u.metalnessStrength).toVar('toonMetalness');
    let specularColor = mix(vec3(1), albedo.div(max(maxComponent(albedo), 1e-3)), metalness);
    if (features.maps?.specularColorMap) {
      specularColor = specularColor.mul(mix(vec3(1), texture(features.maps.specularColorMap).rgb, u.specularColorStrength));
    }
    const specularLight = light.mul(specularColor).mul(specular).mul(mix(u.specularInShadow, float(1), litAmount)).toVar('toonSpecular');
    color.addAssign(specularLight);

    const ring = float(0).toVar('toonHairRing');
    if (mayBeHair) {
      ring.assign(hairRing(u, { head, normal: lightingNormal, viewDirection, worldPosition })
        .mul(u.hairRingIntensity).mul(hairWeight).mul(state.headReady)
        .mul(mix(u.hairRingShadowFloor, float(1), litAmount)));
      const ringColor = light.mul(toLinear(mix(toDisplay(albedo), vec3(1), 0.62)));
      color.assign(mix(color, ringColor, clamp(ring, 0, 1)));
    }

    if (features.bake?.detail === 'sheer' && bake) {
      const streak = sheerStreak(u, lightingNormal, halfVector, bake.w);
      color.addAssign(u.sheerColor.mul(light).mul(streak).mul(mix(u.highlightShadowFloor, float(1), litAmount)));
    }

    const matcap = vec3(0).toVar('toonMatcap');
    if (features.maps?.matcapMap) {
      const metalWeight = role === 'metal' ? float(1) : max(metalness, 0.35);
      matcap.assign(texture(features.maps.matcapMap, matcapUV(lightingNormal, viewPosition)).rgb);
      color.addAssign(matcap.mul(albedo).mul(light).mul(u.matcapStrength).mul(metalWeight));
    }

    // Rim.
    const rimNodes = rimAmount(u, state, {
      lightDirection,
      normal: lightingNormal,
      normalView,
      silhouette: blend('rimSilhouette'),
      viewDirection,
      viewPosition,
    });
    const rimColor = light.mul(u.rimTint).mul(mix(vec3(1), albedo, u.rimAlbedoMix))
      .mul(blend('rimIntensity')).mul(mix(u.rimInShadow, float(1), litAmount));
    const rim = rimColor.mul(rimNodes.rim).toVar('toonRim');
    color.addAssign(rim);

    const emission = vec3(0).toVar('toonEmission');
    if (features.emissive) {
      let emitted = u.emissiveColor.mul(u.emissiveTint).mul(u.emissiveStrength);
      if (features.maps?.emissiveMap) emitted = emitted.mul(texture(features.maps.emissiveMap).rgb);
      emission.assign(emitted);
      color.addAssign(emission);
    }

    if (features.furLayer) color.mulAssign(mix(float(1).sub(u.shellRootShade), float(1), features.furLayer));

    // Debug views (a uniform write selects one).
    const result = color.toVar('toonResult');
    If(u.debugMode.greaterThan(0.5), () => {
      const roles = createRolesChunk({ flags: { isOutlinePass: false }, u: { materialRole: u.materialRole }, w: weights });
      const id = CHARACTER_DEBUG_VIEW_IDS;
      const views = [
        [id.albedo, albedo],
        [id.sourceAlbedo, source],
        [id.litAmount, vec3(litAmount)],
        [id.terminator, vec3(lit)],
        [id.sceneShadow, vec3(sceneRaw)],
        [id.characterShadow, vec3(characterRaw)],
        [id.screenSpaceShadow, vec3(screenRaw)],
        [id.faceMap, mix(vec3(0.5, 0.5, 0.55), vec3(faceMapLit), faceMapAmount)],
        [id.shadowColor, shadowColor.mul(light)],
        [id.lightColor, light],
        [id.rim, rim],
        [id.depthRim, vec3(rimNodes.depthRim)],
        [id.specular, specularLight],
        [id.hairHighlight, vec3(ring)],
        [id.roles, roles.debugMaterialRoleColor()],
        [id.alpha, vec3(alpha)],
        [id.lightingMap, vec3(bias.add(0.5))],
        [id.normalMap, lightingNormal.mul(0.5).add(0.5)],
        [id.ao, vec3(occlusionVar)],
        [id.emissive, emission],
        [id.matcap, matcap],
      ];
      for (const [value, node] of views) {
        If(u.debugMode.equal(value), () => {
          result.assign(node);
        });
      }
    });
    return vec4(result, alpha);
  })();
}

// ---------------------------------------------------------------------------
// Outline hull.

function vertexBlend(u, features) {
  return createBlend(u, roleWeights(features, { vertex: true }));
}

// View-space displacement of the hull: outward along the (baked smooth)
// geometry normal by the role's width, corrected to a constant on-screen
// width, and pushed back along the view ray on faces.
function outlineViewOffset(u, features) {
  return (positionViewBase) => {
    const blend = vertexBlend(u, features);
    const weights = roleWeights(features, { vertex: true });
    const faceWeight = roleWeightOf(features.role, features, weights, 'face');
    const normalView = normalize(transformNormalToView(normalLocal));
    const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
    const scaleY = cameraProjectionMatrix.element(1).y;
    const distance = positionViewBase.z.negate().max(1e-3);
    const units = select(orthographic, float(1).div(scaleY), min(distance, u.outlineFadeDistance).div(scaleY));
    const correction = mix(float(1), units.div(max(u.outlineReferenceUnits, 1e-4)), u.outlineScreenSpace);
    let width = blend('outlineWidth').mul(correction);
    if (features.outlineWidthMap) {
      width = width.mul(dot(texture(features.outlineWidthMap, uv(0)).level(0), u.outlineWidthMapChannel));
    }
    if (features.vertexColorWidth) {
      const colorValue = attribute('color');
      const color = vec4(colorValue.xyz, features.vertexColorAlpha ? colorValue.w : float(1));
      const selector = u.outlineVertexColorChannel;
      const selected = dot(color, selector);
      width = width.mul(select(dot(selector, vec4(1)).greaterThan(0.5), selected, float(1)));
    }
    width = min(width, u.outlineMaxWidth);
    const away = select(orthographic, vec3(0, 0, -1), normalize(positionViewBase));
    return normalView.mul(width).add(away.mul(u.outlineFaceDepthPush.mul(faceWeight)));
  };
}

// Ink: the lit colour under the line times the role's ink in display space,
// then saturation raised and hue stepped (scaled by the fill's chroma so grey
// and black lines stay neutral), darkened toward the shadow side by the
// lighting mix and clamped to the role's brightness range.
function outlineColorNode(u, features, state) {
  return Fn(() => {
    const geometryNormal = normalWorldGeometry.toVar('toonHullNormal');
    if (features.dither) ditherDiscard(u);
    // A cutout hull cannot use early depth rejection; most of it lies behind
    // the body, so drop it before shading the ink.
    if (features.cutout) hiddenSurfaceDiscard(state, positionView);
    const weights = roleWeights(features);
    const blend = createBlend(u, weights);
    const { alpha, albedo } = albedoNodes(u, features);
    const { direction: lightDirection } = shadingDirection(u);
    const { light } = characterLight(u, geometryNormal);
    const terminator = blend('terminator');
    const softness = max(blend('softness'), 0.02);
    const lit = smoothstep(terminator.sub(softness), terminator.add(softness), dot(geometryNormal, lightDirection));
    const fill = albedo.mul(light);
    const chromaWeight = smoothstep(0.02, 0.12, displayChroma(fill));
    const inked = rgbToHsv(clamp(toDisplay(fill).mul(blend('ink')), 0, 1)).toVar('toonInkHsv');
    inked.y.assign(clamp(inked.y.add(blend('inkSaturation').mul(chromaWeight)), 0, 1));
    inked.x.assign(fract(inked.x.add(u.inkHueShift.mul(chromaWeight)).add(1)));
    let line = toLinear(hsvToRgb(inked)).mul(mix(float(1), lit, blend('outlineLightingMix')));
    if (features.outlineColorOverride) {
      const authored = u.outlineColorOverride.xyz.mul(mix(vec3(1), light, u.outlineOverrideLightingMix));
      line = mix(line, authored, u.outlineColorOverride.w);
    }
    const display = toDisplay(line).toVar('toonInkDisplay');
    const brightness = maxComponent(display);
    const target = clamp(brightness, blend('outlineMinBrightness'), blend('outlineMaxBrightness'));
    const result = toLinear(display.mul(target.div(max(brightness, 1e-4)))).toVar('toonInk');
    If(u.debugMode.greaterThan(0.5), () => {
      result.assign(vec3(0));
    });
    return vec4(result, alpha);
  })();
}

// Fur shells: strands thin toward the tip (a per-cell hash against the
// shell's layer), displaced along the normal and sagging with gravity.
function furDiscard(u, layer) {
  const cell = uv(0).mul(u.shellDensity.mul(100)).floor();
  const noise = hash(cell.x.add(cell.y.mul(4099)));
  If(noise.lessThan(float(layer).add(u.shellRootOffset)), () => {
    Discard();
  });
}

function furViewOffset(u, layer) {
  return () => {
    const normalView = normalize(transformNormalToView(normalLocal));
    const down = cameraViewMatrix.mul(vec4(0, -1, 0, 0)).xyz;
    return normalView.mul(u.shellLength.mul(layer)).add(down.mul(u.shellLength.mul(u.shellSag).mul(layer * layer)));
  };
}

// Brows, lashes and eye lines draw over the bangs: their depth is pulled
// toward the camera while the face points at it.
function overHairViewOffset(u, state) {
  return (positionViewBase) => {
    const toCamera = normalize(cameraPosition.sub(state.headPosition));
    const facing = smoothstep(0.25, 0.65, dot(state.headForward, toCamera)).mul(state.headReady);
    const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
    const toward = select(orthographic, vec3(0, 0, 1), normalize(positionViewBase).negate());
    return toward.mul(u.overHairDepth.mul(facing));
  };
}

// ---------------------------------------------------------------------------
// Pass variants.

/**
 * Depth-as-colour variant for the depth prepass and the character shadow
 * map: r = window depth, offset by 2 on face pixels (so face receivers can
 * ignore face occluders), alpha-tested like the colour pass.
 */
export function createCharacterDepthVariant(material) {
  const features = material.userData.toonFeatures;
  const variant = new PassBasicNodeMaterial({ side: material.side });
  variant.isShadowPassMaterial = true;
  const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
  const depth = select(
    orthographic,
    viewZToOrthographicDepth(positionView.z, cameraNear, cameraFar),
    viewZToPerspectiveDepth(positionView.z, cameraNear, cameraFar),
  );
  const weights = roleWeights(features);
  const faceWeight = features.role === 'eye' ? float(1) : roleWeightOf(features.role, features, weights, 'face');
  // Face (and eye) surfaces are offset so face receivers can tell and
  // ignore them (castShadows.js decodeStoredDepth).
  const encoded = select(faceWeight.greaterThan(0.5), depth.add(FACE_DEPTH_OFFSET), depth);
  const alpha = features.baseMap ? texture(features.baseMap).a : float(1);
  variant.colorNode = vec4(encoded, 0, 0, alpha);
  if (material.alphaTest > 0) variant.alphaTest = material.alphaTest;
  variant.name = `${material.name || 'ToonCharacter'}:Depth`;
  return variant;
}

/** White coverage mask variant (character-aware post effects). */
export function createCharacterMaskVariant(material) {
  const features = material.userData.toonFeatures;
  const variant = new PassBasicNodeMaterial({ side: material.side });
  variant.isShadowPassMaterial = true;
  const alpha = features.baseMap ? texture(features.baseMap).a : float(1);
  variant.colorNode = vec4(1, 1, 1, alpha);
  if (material.alphaTest > 0) variant.alphaTest = material.alphaTest;
  variant.name = `${material.name || 'ToonCharacter'}:Mask`;
  return variant;
}

// ---------------------------------------------------------------------------
// Assembly.

/**
 * Builds a character material.
 *
 * - `params`: uniform values (characterParameters.js plus per-material
 *   inputs such as `baseColor`); every key becomes a uniform.
 * - `features`: graph-build gates and textures — `role`, `outline`,
 *   `baseMap`, `roleWeights` ('attribute' | 'mask'), `roleMaskMap`,
 *   `bake` ({ any, faceUv, occlusion, detail }), `faceMap`,
 *   `faceMapCoords` ('bake' | 0 | 1), `noseMark`, `lightingMap`,
 *   `lightingMapUv`, `shadeOverride`, `shadeMap`, `toneOverride`,
 *   `rampMap`, `rampMapDecoded`, `specularMask`, `maps` (normalMap, aoMap,
 *   emissiveMap, matcapMap, detailMap, roughnessMap, metalnessMap,
 *   specularColorMap), `emissive`, `sticker` ({ map, uvChannel }),
 *   `vertexColors`, `outlineWidthMap`, `vertexColorWidth`,
 *   `outlineColorOverride`, `overHairFeature`, `materialRole`, `cutout`
 *   (alpha-tested), `dither` (screen-door fade compiled in).
 * - `state`: the character's shared state (characterState.js).
 */
export function createToonCharacterMaterial({ features, params, state, side = THREE.DoubleSide }) {
  const material = new ToonCharacterNodeMaterial();
  const uniforms = {};
  for (const [name, value] of Object.entries({ ...MATERIAL_INPUT_DEFAULTS, ...params })) uniforms[name] = uniformFor(value);
  uniforms.debugMode = uniform(0);
  uniforms.materialRole = uniform(features.materialRole ?? 0, 'int');
  material.uniforms = uniforms;
  material.toneMapped = false;
  material.userData.toonFeatures = features;
  bindMaterialToCharacterState(material, state);

  const build = () => {
    const current = material.userData.toonFeatures;
    material.colorNode = current.outline
      ? outlineColorNode(uniforms, current, state)
      : surfaceColorNode(uniforms, current, state);
  };
  if (features.outline) {
    material.side = THREE.BackSide;
    material.viewOffset = outlineViewOffset(uniforms, features);
  } else {
    material.side = side;
    if (features.furLayer) material.viewOffset = furViewOffset(uniforms, features.furLayer);
    else if (features.overHairFeature) material.viewOffset = overHairViewOffset(uniforms, state);
  }
  build();
  // Screen-door fading is compiled in on first use (a shader that may
  // discard loses early depth rejection, so opaque characters go without).
  material.userData.enableDither = () => {
    if (material.userData.toonFeatures.dither) return false;
    material.userData.toonFeatures = { ...material.userData.toonFeatures, dither: true };
    build();
    material.needsUpdate = true;
    return true;
  };
  material.userData.createDepthColorVariant = () => createCharacterDepthVariant(material);
  material.userData.createMaskVariant = () => createCharacterMaskVariant(material);
  return material;
}
