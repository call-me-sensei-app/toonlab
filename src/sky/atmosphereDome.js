// The sky dome: a node material that ray-marches the baked scattering tables,
// draws the sun disc, and hands the host linear HDR radiance.
//
// Nothing here applies `atmosphere.exposure` or a tonemap curve. The post chain
// owns both, so this material's output is unbounded radiance in the same unit as
// `sun.intensity`, and the sun disc really is three or four orders of magnitude
// above the sky.
//
// The dome is only the atmosphere plus the sun. Stars, the moon and the god-ray
// pass compose on top of `skyRadiance()`, which is exported for exactly that.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  dot,
  float,
  Fn,
  max,
  normalize,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

import { finiteNumber } from '../cloud/paramSchema.js';
import { atmosphereRaymarchNodes } from './atmosphereScattering.js';
import { placeInLayer, RenderLayer } from './renderLayers.js';
import { applySkyColorNode } from './skyColor.js';
import { createSun } from './sunDriver.js';

const SKY_DOME_MARCH_STEPS = 12;

/**
 * Builds the sky dome.
 *
 * `radius` only has to keep the mesh out of the way; the shading is per-fragment
 * from the view direction, so tessellation and scale do not affect the image.
 * The host camera still has to include that carrier geometry in its frustum:
 * `depthTest: false` keeps it off the depth buffer but does not bypass clip-space
 * near/far clipping. The render layer holds it behind every scene object.
 */
export function createAtmosphereDome({
  params,
  style = null,
  scattering,
  sun = createSun(),
  timeOfDay = null,
  radius = 10_000,
  steps = SKY_DOME_MARCH_STEPS,
  name = 'ToonLabAtmosphereDome',
} = {}) {
  if (!params?.skyMultipleScattering) {
    throw new TypeError('createAtmosphereDome needs an atmosphere param group.');
  }
  if (!scattering?.transmittanceNode) {
    throw new TypeError('createAtmosphereDome needs a scattering bake.');
  }

  // World Y of the ground plane, so a camera above it sees the horizon dip and
  // the sky thin out. Metres, converted to the scattering module's kilometres.
  const groundLevel = uniform(0);
  // Atmospheric scatter uses scalar sun intensity. The
  // warm sun colour is applied to the disc and direct cloud light separately.
  const skySunIntensity = () => vec3(sun.intensity);

  /**
   * Linear HDR radiance along a world-space view direction, sun disc included.
   * Exported so the env-map bake and the night sky reuse one definition of "what
   * the sky looks like this frame".
   *
   * A TSL `Fn` rather than a plain node-emitting helper: the ray-march mutates
   * accumulators, which needs an enclosing shader stack, and wrapping it here
   * means callers can invoke it from their own graphs without knowing that. It
   * does not save any instructions — the emitted WGSL and GLSL both inline the
   * whole march into `main` rather than declaring a function for it.
   */
  const skyRadiance = Fn(([viewDir]) => {
    const direction = normalize(viewDir).toVar();

    const march = atmosphereRaymarchNodes({
      scattering,
      viewDir: direction,
      sunDir: sun.direction,
      sunIrradiance: skySunIntensity(),
      mieDirectionalG: params.mieDirectionalG,
      mieScatteringStrength: params.mieScatteringStrength,
      skyMultipleScattering: params.skyMultipleScattering,
      steps,
    });

    // SkyMaterial.ts uses a soft step across the authored disc size, then tints
    // it by ground-level atmosphere transmittance.
    const discSize = max(sun.discSize, 1e-7).toVar();
    const disc = smoothstep(
      float(1).sub(discSize),
      float(1).sub(discSize.mul(0.5)),
      dot(direction, sun.direction),
    );
    const groundSunTransmittance = scattering.transmittanceNode(float(0), sun.direction.y);
    const sunColor = sun.color.mul(groundSunTransmittance).mul(sun.intensity).mul(disc);
    return applySkyColorNode(
      march.luminance,
      direction,
      style,
      timeOfDay,
    ).add(sunColor);
  });

  const material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  material.name = name;
  material.fog = false;
  material.colorNode = Fn(() => {
    const viewDir = positionWorld.sub(cameraPosition);
    return vec4(max(skyRadiance(viewDir), vec3(0)), 1);
  })();

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.name = name;
  mesh.scale.setScalar(radius);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  const group = new THREE.Group();
  group.name = `${name}Root`;
  group.frustumCulled = false;
  group.add(mesh);

  // Placed by role, not by a raw renderOrder on the mesh. three r185 takes the
  // enclosing Group's renderOrder as the *primary* sort key (projectObject:
  // `if (object.isGroup) groupOrder = object.renderOrder`, and painterSortStable
  // compares groupOrder before renderOrder), so a -1000 on the mesh alone leaves
  // the dome sorting as (groupOrder 0, renderOrder -1000) and any host content
  // inside a group of its own can land in front of it. `placeInLayer` writes both.
  // With `depthTest: false` the draw order is the only thing holding the dome
  // behind the scene, so it has to be the order three actually sorts on.
  placeInLayer(group, RenderLayer.background);

  return {
    group,
    mesh,
    material,
    sun,
    scattering,
    uniforms: { groundLevel },
    skyRadiance,

    /** World Y treated as ground, in metres. */
    get groundLevel() {
      return groundLevel.value;
    },

    // Unreadable input falls back to the current value, the same contract the
    // param group states and implements. Snapping to 0 instead would teleport
    // the ground plane — and with it the horizon and the whole view-height term
    // — on a typo, which is a much larger edit than the caller asked for.
    //
    // `Number(value)` was not that contract: it reads `null`, `''`, `[]` and
    // `false` as a perfectly finite 0, so exactly the inputs a cleared field or
    // a JSON round-trip produces were the ones that moved the ground. The shared
    // reader is narrower, so those hold and only a real number (or a numeric
    // string, which is what a lab input carries) writes.
    set groundLevel(value) {
      const next = finiteNumber(value);
      if (next === null) return;
      groundLevel.value = next;
    },

    /**
     * Re-centres the dome and picks up a pending table bake. Safe every frame:
     * the bake only runs when rayleigh, turbidity or groundAlbedo moved.
     */
    update(_delta, camera) {
      scattering.bakeIfNeeded();
      if (camera?.position) group.position.copy(camera.position);
      return group;
    },

    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
