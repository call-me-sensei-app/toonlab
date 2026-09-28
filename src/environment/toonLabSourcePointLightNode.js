import { PointLight } from 'three';
import { PointLightNode } from 'three/webgpu';
import { float } from 'three/tsl';

/**
 * Point-light node for ToonLab's non-inverse-square radial attenuation branch.
 * Lights without a `toonLabSourcePointLight` contract retain Three's stock path.
 */
export class ToonLabSourcePointLightNode extends PointLightNode {
  static get type() {
    return 'ToonLabSourcePointLightNode';
  }

  setupDirect(builder) {
    const contract = this.light?.userData?.toonLabSourcePointLight;
    if (!contract || contract.useInverseSquaredFalloff !== false) {
      return super.setupDirect(builder);
    }

    const lightVector = this.getLightVector(builder);
    const lightDirection = lightVector.normalize();
    const radius = Math.max(Number.EPSILON, Number(contract.attenuationRadiusMeters));
    const exponent = Math.max(Number.EPSILON, Number(contract.lightFalloffExponent));
    const normalizedDistanceSquared = lightVector
      .dot(lightVector)
      .div(float(radius * radius));
    const attenuation = float(1)
      .sub(normalizedDistanceSquared.clamp(0, 1))
      .pow(exponent);

    return {
      lightDirection,
      lightColor: this.colorNode.mul(attenuation),
    };
  }
}

/**
 * Replace only the PointLight node-class mapping. The custom class delegates
 * ordinary Three point lights back to PointLightNode.
 */
export function installToonLabSourcePointLightNode(renderer) {
  if (!renderer?.library?.lightNodes) {
    throw new Error('A WebGPU renderer node library is required.');
  }
  renderer.library.lightNodes.set(PointLight, ToonLabSourcePointLightNode);
}
