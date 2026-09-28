// Designer-stage ground surface: the portable Ground Shader — the same
// compatibility material the Ground Shader Lab authors and the Landscape
// runtime renders — driven by a single all-grass splat texel, so the whole
// disc gets the accepted call_me_sensei meadow treatment (macro variation,
// slope response, and weather hooks all evaluate in world space).
//
// The compatibility graph computes its own stylized sun/sky shade, so the
// tree's moving canopy reaches it through the shared sun-shadow pass rather
// than native shadow maps. The disc also registers as a ground-field writer
// and renders one top-down capture (the runtime's RVT stand-in) so grass
// blades can adopt the shader's ground color at their roots. Pure scene
// furniture — never part of the recipe or exports.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { mix, positionWorld, vec3 } from 'three/tsl';

import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import { environmentGroundField } from '../../../src/shaders-tsl/chunks/environment-ground-field.js';
import { createCompatibilityGroundShaderMaterial } from '../../../src/ground-shader/index.js';
import { sampleEnvironmentSunShadow } from '../../../src/shaders-tsl/chunks/environment-sun-shadow.js';

export function installGroundSurface({ engine }) {
  const { ground, renderer, scene, sun } = engine;

  const material = createCompatibilityGroundShaderMaterial({
    // One full-weight grass texel — layer detail textures stay empty, so the
    // portable profile's tints and world-space noise carry the look.
    field: { splat: new Uint8Array([255, 0, 0, 0]), splatW: 1, splatD: 1 },
    settings: {
      // The first-party comparison grass uses a muted sage tint against mesh grass
      // that samples it back; under this lab's yellow-green blade palette it
      // washes the whole meadow gray. Match the blade base green instead.
      layers: { grassTint: [0.4, 0.62, 0.27] },
    },
  });
  const adapter = material.userData.toonlabGroundShader;
  // The pre-shadow graph feeds the ground-field capture: blades apply scene
  // shadow themselves, so adopting a shadow-baked ground color would darken
  // roots under the canopy twice.
  const groundColorNode = material.colorNode;
  // Canopy occlusion, tinted with the profile's own cool shadow treatment.
  material.colorNode = groundColorNode.mul(mix(
    mix(
      vec3(1),
      adapter.styleUniforms.uStyleLightingShadowTint,
      adapter.styleUniforms.uStyleLightingShadowTintStrength,
    ),
    vec3(1),
    sampleEnvironmentSunShadow(positionWorld),
  ));
  // Exact ground color for the top-down ground-field capture; without this
  // the pass falls back to material.color and the field would read as white.
  material.userData.createGroundColorVariant = () => {
    const variant = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    variant.name = `${material.name} — ground-field color writer`;
    variant.colorNode = groundColorNode;
    return variant;
  };

  const previous = ground.material;
  ground.material = material;
  // The graph shades itself; native shadow reception would darken it twice.
  ground.receiveShadow = false;
  ground.userData.groundFieldWrite = true;
  previous.dispose();

  const groundFieldPass = createEnvironmentGroundFieldPass({
    renderer,
    resolution: 1024,
    scene,
  });
  // Soften blade adoption toward the local ground average instead of the
  // exact texel (the same knob the reference comparison scene uses).
  environmentGroundField.colorMipLevel.value = 2;

  // The disc never moves: capture the field once the backend is rendering,
  // then leave it alone.
  let fieldCaptured = false;
  engine.onFrame(() => {
    // Follow the sky/weather rig — uniform copies only, no material churn.
    adapter.setSceneState({
      skyColor: scene.fog?.color,
      sunColor: sun.color,
      sunDirection: sun.position,
    });
    if (!fieldCaptured) {
      fieldCaptured = true;
      groundFieldPass.update();
    }
  });

  return { groundFieldPass, material };
}
