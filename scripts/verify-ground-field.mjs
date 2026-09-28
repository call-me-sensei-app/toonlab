// Ground-field contract verification (node-level): module surface, opt-in
// writer collection, ready-gating, and classic-backend no-op. The visual
// half — grass adopting terrain color in a live render — is covered by the
// verdant-world captures (scripts/capture-verdant-world.mjs).

import assert from 'node:assert/strict';
import * as THREE from 'three';

import * as environment from '../src/environment/index.js';
import { createEnvironmentGroundFieldPass } from '../src/environment/environmentGroundFieldPass.js';
import {
  environmentGroundField,
  groundFieldColorMapNode,
  groundFieldHeightMapNode,
  groundBlendFactor,
  sampleGroundColor,
  sampleGroundHeight,
} from '../src/shaders-tsl/chunks/environment-ground-field.js';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

check('ground-field pass is available from the environment barrel', () => {
  assert.equal(environment.createEnvironmentGroundFieldPass, createEnvironmentGroundFieldPass);
});

check('chunk exposes the shared uniform surface and samplers', () => {
  assert.equal(environmentGroundField.ready.value, false);
  assert.ok(environmentGroundField.matrix.value.isMatrix4);
  assert.equal(typeof sampleGroundColor, 'function');
  assert.equal(typeof sampleGroundHeight, 'function');
  assert.equal(typeof groundBlendFactor, 'function');
});

check('lazy map nodes are created once with fallback textures', () => {
  const color = groundFieldColorMapNode();
  const height = groundFieldHeightMapNode();
  assert.equal(groundFieldColorMapNode(), color);
  assert.equal(groundFieldHeightMapNode(), height);
  assert.ok(color.value.isTexture);
  assert.ok(height.value.isTexture);
});

check('construction requires renderer and scene', () => {
  assert.throws(() => createEnvironmentGroundFieldPass(), /requires/);
});

check('classic (non-node) backends no-op and never flip ready', () => {
  const scene = new THREE.Scene();
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
  terrain.userData.groundFieldWrite = true;
  scene.add(terrain);
  const pass = createEnvironmentGroundFieldPass({
    renderer: { coordinateSystem: THREE.WebGLCoordinateSystem, shadowMap: {} },
    scene,
  });
  pass.update();
  assert.equal(environmentGroundField.ready.value, false);
  assert.equal(pass.colorTexture, null);
  pass.dispose();
});

check('node-backend pass with no tagged writers stays not-ready', () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  let rendered = 0;
  const pass = createEnvironmentGroundFieldPass({
    renderer: {
      isWebGPURenderer: true,
      coordinateSystem: THREE.WebGPUCoordinateSystem,
      shadowMap: { enabled: false },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: () => { rendered += 1; },
    },
    scene,
  });
  pass.update();
  assert.equal(environmentGroundField.ready.value, false);
  assert.equal(rendered, 0, 'untagged meshes must not trigger a field render');
  pass.dispose();
});

check('tagged writers render both targets and publish the field', () => {
  const scene = new THREE.Scene();
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial());
  terrain.rotation.x = -Math.PI / 2;
  terrain.userData.groundFieldWrite = true;
  scene.add(terrain);
  const bystander = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(bystander);

  let rendered = 0;
  let bystanderVisibleDuringRender = null;
  const pass = createEnvironmentGroundFieldPass({
    renderer: {
      isWebGPURenderer: true,
      coordinateSystem: THREE.WebGPUCoordinateSystem,
      shadowMap: { enabled: false },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: () => {
        rendered += 1;
        bystanderVisibleDuringRender = bystander.visible;
        assert.equal(environmentGroundField.ready.value, false, 'field must be off during its own render');
      },
    },
    scene,
    resolution: 256,
  });

  pass.update();
  assert.equal(
    rendered,
    4,
    'one color pass + one filtered-color pass + one surface pass + one height pass',
  );
  assert.equal(bystanderVisibleDuringRender, false, 'non-writers hidden during the pass');
  assert.equal(bystander.visible, true, 'visibility restored after the pass');
  assert.equal(environmentGroundField.ready.value, true);
  assert.equal(groundFieldColorMapNode().value, pass.colorTexture);
  assert.equal(groundFieldHeightMapNode().value, pass.heightTexture);
  assert.ok(environmentGroundField.heightSpan.value > 0);

  pass.update();
  assert.equal(rendered, 4, 'static scene renders once (signature gate)');
  pass.invalidateColor();
  pass.update();
  assert.equal(rendered, 6, 'shadow/color invalidation refreshes only both color targets');
  pass.invalidate();
  pass.update();
  assert.equal(rendered, 10, 'full invalidation refreshes all four targets');

  pass.dispose();
  assert.equal(environmentGroundField.ready.value, false);
});

console.log(`\nverify-ground-field: ${checks} checks passed`);
