import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { dot, mix, normalWorld, positionWorld, uniform } from 'three/tsl';
import { sampleEnvironmentSunShadow } from '../../src/shaders-tsl/chunks/environment-sun-shadow.js';

/** A simple lit ground whose grass-adoption writer shares its visible color. */
export function createPreviewGroundMaterial({ color = 0x557548, roughness = 0.98 } = {}) {
  const material = new MeshBasicNodeMaterial({ color });
  material.roughness = roughness;
  const light = {
    sunColor: uniform(new THREE.Color()),
    skyColor: uniform(new THREE.Color()),
    groundColor: uniform(new THREE.Color()),
    direction: uniform(new THREE.Vector3(0, 1, 0)),
  };
  const direct = dot(normalWorld, light.direction).max(0)
    .mul(sampleEnvironmentSunShadow(positionWorld));
  const ambient = mix(light.groundColor, light.skyColor, normalWorld.y.mul(0.5).add(0.5));
  material.colorNode = uniform(material.color).mul(ambient.add(light.sunColor.mul(direct)));
  let variant;
  material.userData.createGroundColorVariant = () => {
    variant ??= new MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
    variant.colorNode = material.colorNode;
    return variant;
  };
  material.userData.setPreviewLighting = ({ sunDirection, sunColor, skyColor, sunIntensity, skyIntensity }) => {
    light.direction.value.copy(sunDirection).normalize();
    light.sunColor.value.copy(sunColor).multiplyScalar(sunIntensity);
    light.skyColor.value.copy(skyColor).multiplyScalar(skyIntensity);
    light.groundColor.value.copy(light.skyColor.value);
  };
  material.addEventListener('dispose', () => variant?.dispose());
  return material;
}
