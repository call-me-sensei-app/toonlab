import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as mesh from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';
import { tickHeldBrush } from '../labs/rock-generation-lab/ui/heldBrush.js';

for (const tool of ['inflate','deflate','pinch','crack','roughen','smooth','scrape','erode','flatten','clay','terrace']) {
  const displacements = [];
  for (const allowLargeDeformation of [false, true]) {
    const geometry = new THREE.SphereGeometry(2, 24, 16);
    const before = new Float32Array(geometry.attributes.position.array);
    mesh.sculptCatalogGeometry(geometry, { tool, allowLargeDeformation, point: [0,2,0], normal: [0,1,0], radius: 2, strength: 10, referenceSnapshot: before });
    assert.ok(mesh.auditCatalogSculptGeometry(geometry, before, { allowLargeDeformation: true }).ok);
    displacements.push(Math.max(...geometry.attributes.position.array.map((v,i) => Math.abs(v-before[i]))));
    const restored = mesh.deserializeCatalogGeometry(mesh.serializeCatalogGeometry(geometry));
    assert.deepEqual(restored.attributes.position.array, geometry.attributes.position.array);
    restored.dispose(); geometry.dispose();
  }
  if (['inflate','deflate','pinch','crack','roughen'].includes(tool)) assert.ok(displacements[1] > displacements[0] * 1.1, `${tool} must not retain its protected-mode clamp`);
  const gesture = { tool, pointer: { clientX: 12, clientY: 13 }, lastStampTime: 0 };
  let stamps = 0;
  for (const now of [20,80,90,160,1000]) tickHeldBrush(gesture, now, () => stamps++);
  assert.equal(stamps, 3, `${tool} builds while held, with no delayed stamp backlog`);
  tickHeldBrush(null, 2000, () => stamps++);
  assert.equal(stamps, 3, 'release stops stamping');
}
for (const tool of ['grab','resize','rotate','drill','mask']) assert.equal(tickHeldBrush({tool,pointer:{},lastStampTime:0},1000,()=>assert.fail()), false);

await mesh.whenCatalogTopologyReady();
const source = new THREE.BoxGeometry(2,4,6,4,4,4);
for (const targetTriangles of [96,384,1536]) {
  const remeshed = mesh.remeshCatalogGeometry(source, { targetTriangles });
  assert.ok(remeshed); const count=(remeshed.index?.count ?? remeshed.attributes.position.count)/3;
  assert.ok(Math.abs(count-targetTriangles) <= targetTriangles*0.2, 'remesh responds to the requested target');
  remeshed.dispose();
}
for (const axis of ['x','y','z']) {
  const mirrored=source.clone(), rotated=source.clone();
  const weights=new Float32Array(source.attributes.position.count).fill(1);
  assert.ok(mesh.mirrorCatalogGeometry(mirrored,weights,axis)>0);
  const before=new Float32Array(rotated.attributes.position.array);
  assert.ok(mesh.rotateCatalogGeometry(rotated,{before,weights,axis:axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1],angle:Math.PI*4+0.5})>0);
  assert.ok(mesh.auditCatalogSculptGeometry(rotated,before,{allowLargeDeformation:true}).ok);
  mirrored.dispose();rotated.dispose();
}
const lower=mesh.decimateCatalogGeometry(source,0.25), higher=mesh.decimateCatalogGeometry(source,0.75);
assert.ok(lower.index.count < higher.index.count);
lower.dispose();higher.dispose();source.dispose();
console.log('Free brush amplitudes, all 11 held brushes, release, arbitrary-angle XYZ transforms, and configurable mesh targets passed.');
