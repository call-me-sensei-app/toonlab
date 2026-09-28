export class AmbientSkyBaker {
    zenithRadiance: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    horizonRadiance: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    groundBounceRadiance: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    sunTransmittance: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    _lastRayleigh: number;
    _lastTurbidity: number;
    _lastMultipleScattering: number;
    _lastSunIntensity: number;
    _lastGroundBounceAlbedo: THREE.Color;
    _lastSunDirection: THREE.Vector3;
    _view: THREE.Vector3;
    _horizon: THREE.Vector3;
    _out: THREE.Vector3;
    _skyDiffuse: THREE.Vector3;
    update(atmosphere: any, sun: any, cloudLighting: any): boolean;
}
import * as THREE from 'three';
