import assert from 'node:assert/strict';
import * as THREE from 'three';
import { projectViewportAxes } from '../labs/rock-generation-lab/ui/viewportAxes.js';
const original = projectViewportAxes(new THREE.Quaternion());
assert.equal(original.find(a=>a.name==='X').x,1);
assert.equal(original.find(a=>a.name==='Y').y,-1);
assert.equal(original.find(a=>a.name==='Z').z,1);
const rotated = projectViewportAxes(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
assert.ok(Math.abs(rotated.find(a=>a.name==='Z').x+1)<1e-10, 'orbiting the camera rotates the displayed axes');
for(const axes of [original,rotated]) {
  assert.equal(new Set(axes.map(a=>a.name)).size,6);
  for(const name of ['X','Y','Z']) {
    const a=axes.find(v=>v.name===name),b=axes.find(v=>v.name==='−'+name);
    assert.ok(Math.abs(a.x+b.x)+Math.abs(a.y+b.y)+Math.abs(a.z+b.z)<1e-10);
  }
}
console.log('Viewport axes passed: XYZ orientation, camera orbit, and all six signed directions.');
