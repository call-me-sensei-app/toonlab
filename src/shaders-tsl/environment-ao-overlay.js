// TSL port of src/shaders/environmentAoOverlay.vert.glsl +
// environmentAoOverlay.frag.glsl — the baked-shadow decal overlay: dark
// texels of an AO/shadow sheet become a tinted transparent shadow, bright
// texels dissolve. Consumed by environmentShaderMaterials'
// createEnvironmentAoMaterial on the TSL backend; exposes `.uniforms` under
// the exact GLSL uniform names (aoMap/shadowColor/opacity) so the lab's
// opacity write-throughs work unchanged.
//
// The GLSL vertex stage is the plain MVP + vUv passthrough, so the node
// material keeps its default vertex path and reads uv() in the fragment.
// GLSL ends with <colorspace_fragment>; the node renderer applies the same
// output transform automatically.

import * as THREE from 'three';
import {
  Discard,
  dot,
  Fn,
  smoothstep,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { fallbackEnvironmentWhiteTexture } from '../environment/environmentTextureResolver.js';

export function createEnvironmentAoOverlayNodeMaterial({
  aoMap = null,
  side = THREE.DoubleSide,
} = {}) {
  const u = {
    aoMap: texture(aoMap ?? fallbackEnvironmentWhiteTexture),
    shadowColor: uniform(new THREE.Color(0.2, 0.14, 0.09)),
    opacity: uniform(0.44),
  };

  const material = new NodeMaterial();
  material.name = 'ToonEnvironmentAoOverlayNode';
  material.lights = false;
  material.fog = false;
  material.side = side;
  material.transparent = true;
  material.depthWrite = false;

  material.fragmentNode = Fn(() => {
    const texel = u.aoMap.sample(uv()).toVar();
    const luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    const shadow = smoothstep(0.08, 0.72, luma.oneMinus());
    const alpha = shadow.mul(texel.a).mul(u.opacity).toVar();
    Discard(alpha.lessThan(0.01));
    return vec4(u.shadowColor, alpha);
  })();

  material.uniforms = u;
  material.userData.isEnvironmentNodeMaterial = true;
  return material;
}
