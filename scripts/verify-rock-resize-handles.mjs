import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHandleResizeDrag, resizeHandlePoint, RESIZE_HANDLES } from '../labs/rock-generation-lab/ui/resizeHandles.js';
import { resizeCatalogGeometry, catalogEditableBounds } from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';

const bounds = new THREE.Box3(new THREE.Vector3(-1,-2,-3), new THREE.Vector3(1,2,3));
for (const eye of [[80,70,120],[-100,60,-90]]) {
  const camera = new THREE.PerspectiveCamera(45,1.6,0.1,1000);
  camera.position.set(...eye); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  const matrixWorld = new THREE.Matrix4().makeRotationY(0.3);
  const rayTo = (point) => new THREE.Ray(camera.position.clone(), point.clone().sub(camera.position).normalize());
  for (const handle of RESIZE_HANDLES) {
    const localStart = resizeHandlePoint(bounds,handle), start=localStart.clone().applyMatrix4(matrixWorld);
    for (const proportional of [true,false]) {
      const drag = createHandleResizeDrag({bounds,handle,matrixWorld,cameraDirection,ray:rayTo(start),proportional});
      assert.ok(drag);
      assert.ok(drag.sample(rayTo(start)).every(v=>Math.abs(v-1)<1e-10), 'picking a handle never jumps');
      const anchor=new THREE.Vector3(...drag.pivot).applyMatrix4(matrixWorld);
      const desired=start.clone().add(start.clone().sub(anchor).multiplyScalar(2));
      if(!proportional && handle.filter(Boolean).length>1) {
        const delta=new THREE.Vector3(0.1,0.15,0.1);
        delta.addScaledVector(cameraDirection,-delta.dot(cameraDirection));
        desired.copy(start).add(delta);
      }
      const factors=drag.sample(rayTo(desired));
      assert.ok(factors?.every(v=>v>0));
      if(proportional) assert.ok(factors.every(v=>Math.abs(v-3)<1e-9),'proportional handle tracks a 3x extension');
      else if(handle.filter(Boolean).length===1) handle.forEach((v,i)=>assert.ok(Math.abs(factors[i]-(v?3:1))<1e-9));
      const geometry=new THREE.BoxGeometry(2,4,6);
      const before=new Float32Array(geometry.attributes.position.array),weights=new Float32Array(before.length/3).fill(1);
      assert.ok(resizeCatalogGeometry(geometry,{before,weights,pivot:drag.pivot,scales:factors})>0);
      geometry.computeBoundingBox();
      const fixed=resizeHandlePoint(geometry.boundingBox,handle.map(v=>-v));
      assert.ok(fixed.distanceTo(new THREE.Vector3(...drag.pivot))<1e-5,'opposite handle remains anchored');
      geometry.dispose();
    }
  }
}
console.log('Resize handles passed: all faces/corners, two camera angles, proportional/free, no pick jump, and anchored opposite handles.');
const root = new THREE.Group();
const visible = new THREE.Mesh(new THREE.BoxGeometry(2,4,6));
const hidden = new THREE.Mesh(new THREE.BoxGeometry(20,40,60)); hidden.visible = false;
root.add(visible, hidden);
assert.deepEqual(catalogEditableBounds({root, previewMeshes:[visible]}).getSize(new THREE.Vector3()).toArray(),[2,4,6], 'hidden LODs cannot keep reported dimensions at the old size');
visible.geometry.dispose(); hidden.geometry.dispose();
