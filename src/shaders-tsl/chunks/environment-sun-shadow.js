// Shared sun-shadow sampling for TSL environment + character materials —
// the node-backend replacement for three's <shadowmask_pars_fragment>
// getShadowMask() (the classic renderer's shadow system is driven by
// materials with lights:true, which the toon pipeline never uses on the node
// backends).
//
// A dedicated pass (src/environment/environmentSunShadowPass.js) renders the
// scene from the shadow-casting sun into a float color target (linear window
// depth — see docs/tsl-conventions.md on depth-texture sampling) and fills
// these shared uniforms. Until that pass runs, `ready` stays false and the
// mask is 1.0 everywhere — identical to a scene with no shadow-casting sun.

import * as THREE from 'three';
import {
  clamp,
  dot,
  float,
  Fn,
  If,
  mix,
  normalize,
  normalWorldGeometry,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';

export const environmentSunShadow = {
  bias: uniform(-0.00004),
  characterDepthBias: uniform(0.001),
  farMap: null,
  farMapSize: uniform(1024),
  farMatrix: uniform(new THREE.Matrix4()),
  farReady: uniform(false, 'bool'),
  map: null, // TextureNode, created lazily below (needs a fallback texture)
  mapSize: uniform(2048),
  matrix: uniform(new THREE.Matrix4()),
  normalBias: uniform(0.01),
  radius: uniform(1),
  ready: uniform(false, 'bool'),
};

let fallbackTexture = null;

function fallbackTextureForShadow() {
  if (!fallbackTexture) {
    const data = new Uint8Array([255, 255, 255, 255]);
    fallbackTexture = new THREE.DataTexture(data, 1, 1);
    fallbackTexture.needsUpdate = true;
  }
  return fallbackTexture;
}

export function sunShadowMapNode() {
  if (!environmentSunShadow.map) environmentSunShadow.map = texture(fallbackTextureForShadow());
  return environmentSunShadow.map;
}

export function farSunShadowMapNode() {
  if (!environmentSunShadow.farMap) environmentSunShadow.farMap = texture(fallbackTextureForShadow());
  return environmentSunShadow.farMap;
}

/**
 * getShadowMask() replacement: 1 fully lit, 0 fully shadowed. worldPosition
 * is the fragment's world position node. The matrix is CPU-composed to yield
 * GL-convention clip coords under the shader's *0.5+0.5 remap on every
 * backend (see shadowClipAdjust in the pass).
 */
function sampleSunShadowWithReceiverNormal(
  worldPosition,
  receiverNormal,
  normalBias,
  depthBias,
) {
  const shadow = float(1.0).toVar();
  If(environmentSunShadow.ready, () => {
    // Environment receivers use their geometric normal so normal maps cannot
    // distort the lookup. Character receivers pass zero normal bias below and
    // use a constant depth-space guard instead.
    const biasedWorldPosition = worldPosition.add(
      normalize(receiverNormal).mul(normalBias),
    );
    const sampleCascade = (matrix, map, mapSize) => {
      const shadowNdc = matrix.mul(vec4(biasedWorldPosition, 1.0));
      const coord = shadowNdc.xyz.div(shadowNdc.w).mul(0.5).add(0.5).toVar();
      const inside = coord.x.greaterThanEqual(0.0).and(coord.x.lessThanEqual(1.0))
        .and(coord.y.greaterThanEqual(0.0)).and(coord.y.lessThanEqual(1.0))
        .and(coord.z.lessThanEqual(1.0)).and(coord.z.greaterThanEqual(0.0));
      const visibility = float(1.0).toVar();
      If(inside, () => {
        const texel = float(1.0).div(mapSize);
        const reference = coord.z.add(depthBias);
        const spread = texel.mul(environmentSunShadow.radius);
        visibility.assign(0.0);
        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            visibility.addAssign(step(
              reference,
              map.sample(coord.xy.add(vec2(x, y).mul(spread))).level(0).x,
            ));
          }
        }
        visibility.divAssign(9.0);
      });
      return { inside, visibility };
    };

    const near = sampleCascade(
      environmentSunShadow.matrix,
      sunShadowMapNode(),
      environmentSunShadow.mapSize,
    );
    shadow.assign(near.visibility);
    If(near.inside.not().and(environmentSunShadow.farReady), () => {
      const far = sampleCascade(
        environmentSunShadow.farMatrix,
        farSunShadowMapNode(),
        environmentSunShadow.farMapSize,
      );
      shadow.assign(far.visibility);
    });
  });
  return shadow;
}

export const sampleEnvironmentSunShadow = /*@__PURE__*/ Fn(([worldPosition]) => {
  return sampleSunShadowWithReceiverNormal(
    worldPosition,
    normalWorldGeometry,
    environmentSunShadow.normalBias,
    environmentSunShadow.bias,
  );
});

export const sampleEnvironmentSunShadowWithNormal = /*@__PURE__*/ Fn(([
  worldPosition,
  receiverNormal,
]) => {
  // A normal-space receiver offset varies across an animated/skinned surface
  // and exposes its triangles as a grid. Character receivers instead use a
  // small constant depth-space guard, which is stable across the mesh. This
  // remains character-specific: broad environment receivers retain the sun
  // rig's normal bias and original depth bias above.
  return sampleSunShadowWithReceiverNormal(
    worldPosition,
    receiverNormal,
    0.0,
    environmentSunShadow.bias.sub(environmentSunShadow.characterDepthBias),
  );
});
