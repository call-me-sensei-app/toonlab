// TSL port of src/shaders/waterKelp.vert.glsl + waterKelp.frag.glsl —
// instanced underwater kelp blades swaying with the water flow.
//
// getShadowMask() → sampleEnvironmentSunShadow(worldPos) (shared sun-shadow
// pass; inert 1.0 until it runs). The material also exposes
// userData.createDepthColorVariant() so depth-as-color passes (the water grab
// pass on the node backends, the sun-shadow pass) see the blades exactly
// where the color pass draws them — same sway, same edge cutout — mirroring
// the tree-leaf convention. Varyings are created per material variant
// (tree-leaf pattern): node graphs may share uniforms, but each material owns
// its varyings.
//
// TODO(tsl Phase 7): fog ordering — GLSL fogs after colorspace; scene fog is
// disabled here until the fog phase resolves the ordering.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cos,
  Discard,
  dot,
  float,
  Fn,
  mix,
  modelWorldMatrix,
  normalize,
  positionGeometry,
  pow,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { waterToonStep, waterValueNoise } from './chunks/water-common.js';

export function createWaterKelpNodeMaterial({
  swayAmplitude = 0.24,
  shadowStrength = 0.55,
} = {}) {
  const u = {
    uTime: uniform(0),
    uSceneShadowStrength: uniform(shadowStrength),
    uFlowDirection: uniform(new THREE.Vector2(1, 0)),
    uFlowSpeed: uniform(0.3),
    uSwayAmplitude: uniform(swayAmplitude),
    uKelpColor: uniform(new THREE.Color()),
    uKelpShadeColor: uniform(new THREE.Color()),
  };

  const vUv = uv();

  // Shared vertex displacement, parameterized by the owning material's
  // varyings (waterKelp.vert.glsl).
  const buildVertexNode = ({ vSeed, vWorldPosition }) => Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    // iInfo = (height, phase, width, yaw)
    const iInfo = attribute('iInfo', 'vec4');

    vSeed.assign(iInfo.y);

    const heightFraction = vUv.y.toVar();
    const bladeHeight = iInfo.x.toVar();
    const yaw = iInfo.w;
    const facing = vec2(cos(yaw), sin(yaw)).toVar();

    const flow = normalize(u.uFlowDirection.add(vec2(1e-4, 0.0))).toVar();
    const bendPhase = u.uTime.mul(u.uFlowSpeed.mul(0.9).add(0.9)).add(iInfo.y.mul(6.28))
      .add(dot(iOrigin.xz, vec2(0.4, 0.31))).toVar();
    const bend = sin(bendPhase).mul(0.5).add(0.5).add(u.uFlowSpeed.mul(0.35)).mul(u.uSwayAmplitude).toVar();
    const wiggle = vec2(flow.y.negate(), flow.x)
      .mul(sin(bendPhase.mul(2.6).add(heightFraction.mul(3.2)))).mul(0.14).mul(u.uSwayAmplitude).toVar();
    const curve = pow(heightFraction, 1.55).toVar();

    const bladePosition = vec3(iOrigin).toVar();
    bladePosition.xz.addAssign(facing.mul(positionGeometry.x.mul(iInfo.z)));
    bladePosition.y.addAssign(heightFraction.mul(bladeHeight));
    bladePosition.xz.addAssign(flow.mul(bend).add(wiggle).mul(curve).mul(bladeHeight));
    bladePosition.y.subAssign(bend.mul(curve).mul(curve).mul(bladeHeight).mul(0.2));

    const worldPosition = modelWorldMatrix.mul(vec4(bladePosition, 1.0)).toVar();
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  // Shared blade silhouette cutout (color + depth variant); returns the
  // distance-from-midrib term the color stage keeps using.
  const bladeCutout = (vSeed) => {
    // Tapered silhouette with a wavy edge; widest near the base.
    const edgeWave = sin(vUv.y.mul(9.0).add(vSeed.mul(37.0))).mul(0.22).add(0.78);
    const halfWidth = vUv.y.mul(0.62).oneMinus().mul(0.5).mul(edgeWave);
    const distanceFromMid = abs(vUv.x.sub(0.5)).toVar();
    Discard(distanceFromMid.greaterThan(halfWidth));

    const tipFade = smoothstep(0.93, 1.0, vUv.y).oneMinus();
    Discard(tipFade.lessThan(0.4));
    return distanceFromMid;
  };

  const material = new NodeMaterial();
  material.name = 'WaterKelp';
  material.lights = false;
  // TODO(tsl Phase 7): fog ordering (see module header).
  material.fog = false;
  material.side = THREE.DoubleSide;

  const vSeed = varying(float(), 'vKelpSeed');
  const vWorldPosition = varying(vec3(), 'vKelpWorldPosition');
  material.vertexNode = buildVertexNode({ vSeed, vWorldPosition });

  material.fragmentNode = Fn(() => {
    const distanceFromMid = bladeCutout(vSeed);

    const shadeNoise = waterValueNoise(vec2(vUv.x.mul(3.0), vUv.y.mul(5.0)).add(vSeed.mul(19.0)));
    const lit = waterToonStep(0.5, 0.09, shadeNoise.add(vUv.y.mul(0.42)));
    const color = mix(u.uKelpShadeColor, u.uKelpColor, lit).toVar();
    // Darker midrib line.
    color.mulAssign(smoothstep(0.02, 0.05, distanceFromMid).oneMinus().mul(0.28).oneMinus());

    // Scene shadows filtering down through the water.
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uSceneShadowStrength);
    color.mulAssign(mix(vec3(0.52, 0.58, 0.68), vec3(1.0), sceneShadow));

    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;

  // Depth-color variant: same sway + cutout, linear window depth as color
  // (pass-depth-color convention; the pass's own camera feeds cameraNear/Far).
  material.userData.createDepthColorVariant = () => {
    const depthMaterial = new NodeMaterial();
    depthMaterial.name = 'WaterKelpDepth';
    depthMaterial.lights = false;
    depthMaterial.fog = false;
    depthMaterial.side = THREE.DoubleSide;
    depthMaterial.isShadowPassMaterial = true; // see pass-depth-color.js
    const dSeed = varying(float(), 'vKelpDepthSeed');
    const dWorldPosition = varying(vec3(), 'vKelpDepthWorldPosition');
    depthMaterial.vertexNode = buildVertexNode({ vSeed: dSeed, vWorldPosition: dWorldPosition });
    depthMaterial.fragmentNode = Fn(() => {
      bladeCutout(dSeed);
      const viewZ = cameraViewMatrix.mul(vec4(dWorldPosition, 1.0)).z;
      const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
      const depth01 = select(
        orthographic,
        viewZToOrthographicDepth(viewZ, cameraNear, cameraFar),
        viewZToPerspectiveDepth(viewZ, cameraNear, cameraFar),
      );
      return vec4(vec3(depth01), 1.0);
    })();
    return depthMaterial;
  };

  return material;
}
