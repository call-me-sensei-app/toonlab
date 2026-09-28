import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { float, positionLocal, vec3 } from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';

import { installToonLabMaterialPassCoupling } from '../src/environment/toonLabMaterialPassCoupling.js';
import { createSceneDepthColorPass } from '../src/shaders-tsl/chunks/scene-depth-color-pass.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const postSource = readFileSync(resolve(ROOT, 'src/post/postProcessing.js'), 'utf8');
assert.match(postSource, /createSceneDepthColorPass\(\{ scene \}\)/,
  'Post processing is not wired to the per-material scene-depth pass.');
assert.doesNotMatch(postSource, /scene\.overrideMaterial\s*=\s*sceneDepthColorMaterial/,
  'Post processing reintroduced the global depth override.');

function coupledMaterial({
  alphaClip = false,
  name,
  positionNode = positionLocal,
  shaderName,
}) {
  const material = new MeshPhysicalNodeMaterial();
  material.name = name;
  installToonLabMaterialPassCoupling(material, {
    ...(alphaClip ? {
      alphaChannel: 'verifier.a',
      alphaNode: float(0.4),
      alphaThreshold: 0.4,
    } : {}),
    positionMode: positionNode === positionLocal ? 'authored' : 'deformed',
    positionNode,
    shaderName,
  });
  return material;
}

const scene = new THREE.Scene();
const sourceBackground = new THREE.Color(0x123456);
const sourceFog = new THREE.Fog(0x654321, 1, 30);
const sourceOverride = new THREE.MeshBasicMaterial({ color: 0xff00ff });
scene.background = sourceBackground;
scene.fog = sourceFog;
scene.overrideMaterial = sourceOverride;

const deformedPosition = positionLocal.add(vec3(0.01, 0.02, 0.03));
const foliageMaterial = coupledMaterial({
  alphaClip: true,
  name: 'Verifier:Foliage',
  positionNode: deformedPosition,
  shaderName: 'ToonLab Graphs/S_FoliageShader',
});
const barkMaterial = coupledMaterial({
  name: 'Verifier:Bark',
  shaderName: 'ToonLab Graphs/S_Bark',
});

const genericPosition = positionLocal.add(vec3(0.04, 0.05, 0.06));
const genericMask = float(0.7).greaterThanEqual(float(0.4));
const genericMaterial = new MeshPhysicalNodeMaterial();
genericMaterial.name = 'Verifier:Generic';
genericMaterial.side = THREE.BackSide;
genericMaterial.positionNode = genericPosition;
genericMaterial.maskNode = genericMask;
genericMaterial.maskShadowNode = genericMask;

const geometry = new THREE.BoxGeometry(1, 1, 1);
const foliageMesh = new THREE.Mesh(geometry, foliageMaterial);
const barkMesh = new THREE.Mesh(geometry, barkMaterial);
const genericMesh = new THREE.Mesh(geometry, genericMaterial);
const noDepthMaterial = new THREE.MeshBasicMaterial({ depthWrite: false });
const noDepthMesh = new THREE.Mesh(geometry, noDepthMaterial);
const outlineMesh = new THREE.Mesh(geometry, foliageMaterial);
outlineMesh.userData.isToonOutline = true;
const points = new THREE.Points(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
  new THREE.PointsMaterial(),
);
const hiddenParent = new THREE.Group();
hiddenParent.visible = false;
const hiddenChild = new THREE.Mesh(geometry, barkMaterial);
hiddenParent.add(hiddenChild);
scene.add(
  foliageMesh,
  barkMesh,
  genericMesh,
  noDepthMesh,
  outlineMesh,
  points,
  hiddenParent,
);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const target = new THREE.WebGLRenderTarget(2, 2);
const previousTarget = new THREE.WebGLRenderTarget(1, 1);
const previousClearColor = new THREE.Color(0xabcdef);
const previousClearAlpha = 0.25;
let renderObservationCount = 0;

const renderer = {
  clearCount: 0,
  clearColor: previousClearColor.clone(),
  clearAlpha: previousClearAlpha,
  currentTarget: previousTarget,
  shadowMap: { enabled: true },
  clear() {
    this.clearCount += 1;
  },
  getClearAlpha() {
    return this.clearAlpha;
  },
  getClearColor(result) {
    return result.copy(this.clearColor);
  },
  getRenderTarget() {
    return this.currentTarget;
  },
  render(renderScene, renderCamera) {
    renderObservationCount += 1;
    assert.equal(renderScene, scene);
    assert.equal(renderCamera, camera);
    assert.equal(this.currentTarget, target);
    assert.equal(this.shadowMap.enabled, false);
    assert.equal(this.clearColor.getHex(), 0xffffff);
    assert.equal(this.clearAlpha, 1);
    assert.equal(scene.background, null);
    assert.equal(scene.fog, null);
    assert.equal(scene.overrideMaterial, null);

    assert.notEqual(foliageMesh.material, foliageMaterial);
    assert.equal(foliageMesh.material.positionNode, foliageMaterial.positionNode);
    assert.equal(foliageMesh.material.maskNode, foliageMaterial.maskNode);
    assert.equal(foliageMesh.material.maskShadowNode, foliageMaterial.maskShadowNode);
    assert.equal(foliageMesh.material.side, THREE.DoubleSide);
    assert.equal(foliageMesh.material.shadowSide, THREE.DoubleSide);
    assert.equal(foliageMesh.material.userData.sceneDepthColorPass.exact, true);

    assert.notEqual(barkMesh.material, barkMaterial);
    assert.equal(barkMesh.material.positionNode, barkMaterial.positionNode);
    assert.equal(barkMesh.material.side, THREE.FrontSide);
    assert.equal(barkMesh.material.shadowSide, THREE.FrontSide);
    assert.equal(barkMesh.material.userData.sceneDepthColorPass.exact, true);

    assert.notEqual(genericMesh.material, genericMaterial);
    assert.equal(genericMesh.material.positionNode, genericPosition);
    assert.equal(genericMesh.material.maskNode, genericMask);
    assert.equal(genericMesh.material.maskShadowNode, genericMask);
    assert.equal(genericMesh.material.side, THREE.BackSide);
    assert.equal(genericMesh.material.shadowSide, THREE.BackSide);
    assert.equal(genericMesh.material.userData.sceneDepthColorPass.coupled, false);
    assert.equal(genericMesh.material.userData.sceneDepthColorPass.exact, false);

    assert.equal(noDepthMesh.visible, false);
    assert.equal(outlineMesh.visible, false);
    assert.equal(points.visible, false);
    assert.equal(hiddenParent.visible, false);
    assert.equal(hiddenChild.material, barkMaterial);
  },
  setClearColor(value, alpha) {
    this.clearColor.set(value);
    this.clearAlpha = alpha;
  },
  setRenderTarget(nextTarget) {
    this.currentTarget = nextTarget;
  },
};

const depthPass = createSceneDepthColorPass({ scene });
const firstReport = depthPass.render(renderer, camera, target);
assert.deepEqual(firstReport, {
  coupledVariantCount: 2,
  coupledVariantCreateCount: 2,
  exactVariantCount: 2,
  genericMaskNodeCount: 1,
  genericPositionNodeCount: 1,
  genericVariantCount: 1,
  genericVariantCreateCount: 1,
  hiddenDerivedMeshCount: 2,
  hiddenNonDepthMeshCount: 1,
  materialVariantCount: 3,
  remainingGenericVariantCount: 1,
  renderCount: 1,
  swappedMeshCount: 3,
});

assert.equal(foliageMesh.material, foliageMaterial);
assert.equal(barkMesh.material, barkMaterial);
assert.equal(genericMesh.material, genericMaterial);
assert.equal(noDepthMesh.visible, true);
assert.equal(outlineMesh.visible, true);
assert.equal(points.visible, true);
assert.equal(scene.background, sourceBackground);
assert.equal(scene.fog, sourceFog);
assert.equal(scene.overrideMaterial, sourceOverride);
assert.equal(renderer.currentTarget, previousTarget);
assert.equal(renderer.clearColor.getHex(), previousClearColor.getHex());
assert.equal(renderer.clearAlpha, previousClearAlpha);
assert.equal(renderer.shadowMap.enabled, true);
assert.equal(foliageMaterial.userData.toonLabPassCoupling.runtime.depthVariantCreateCount, 1);
assert.equal(barkMaterial.userData.toonLabPassCoupling.runtime.depthVariantCreateCount, 1);

const secondReport = depthPass.render(renderer, camera, target);
assert.equal(secondReport.renderCount, 2);
assert.equal(secondReport.coupledVariantCreateCount, 2);
assert.equal(secondReport.genericVariantCreateCount, 1);
assert.equal(renderObservationCount, 2);
assert.equal(renderer.clearCount, 2);
assert.equal(foliageMaterial.userData.toonLabPassCoupling.runtime.depthVariantCreateCount, 1);
assert.equal(barkMaterial.userData.toonLabPassCoupling.runtime.depthVariantCreateCount, 1);

// A broken explicit factory must fail closed without leaving any earlier mesh
// swapped or any visibility/renderer/scene state altered.
const brokenMaterial = new MeshPhysicalNodeMaterial();
brokenMaterial.name = 'Verifier:BrokenFactory';
brokenMaterial.userData.createDepthColorVariant = () => {
  throw new Error('intentional verifier factory failure');
};
const brokenMesh = new THREE.Mesh(geometry, brokenMaterial);
scene.add(brokenMesh);
assert.throws(
  () => depthPass.render(renderer, camera, target),
  /intentional verifier factory failure/,
);
assert.equal(foliageMesh.material, foliageMaterial);
assert.equal(barkMesh.material, barkMaterial);
assert.equal(genericMesh.material, genericMaterial);
assert.equal(brokenMesh.material, brokenMaterial);
assert.equal(noDepthMesh.visible, true);
assert.equal(outlineMesh.visible, true);
assert.equal(points.visible, true);
assert.equal(scene.background, sourceBackground);
assert.equal(scene.fog, sourceFog);
assert.equal(scene.overrideMaterial, sourceOverride);
assert.equal(renderer.currentTarget, previousTarget);
assert.equal(renderer.clearColor.getHex(), previousClearColor.getHex());
assert.equal(renderer.clearAlpha, previousClearAlpha);
assert.equal(renderer.shadowMap.enabled, true);
assert.equal(depthPass.report().renderCount, 2);
scene.remove(brokenMesh);

depthPass.dispose();
target.dispose();
previousTarget.dispose();
sourceOverride.dispose();
noDepthMaterial.dispose();
genericMaterial.dispose();
foliageMaterial.dispose();
barkMaterial.dispose();
brokenMaterial.dispose();
points.material.dispose();
points.geometry.dispose();
geometry.dispose();

console.log('Scene depth-color pass verified: exact ToonLab mask/WPO/cull coupling, generic fallback accounting, cache reuse, and full state restoration.');
