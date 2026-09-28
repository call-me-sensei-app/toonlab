import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';

import {
  ROCK_REGION_BINDING_KEY,
  ROCK_REGION_CHANNELS,
  ROCK_REGION_GLTF_ATTRIBUTE,
  ROCK_REGION_THREE_ATTRIBUTE,
  inspectRockRegionBinding,
} from '../src/rock-shader/index.js';

function meshWithBinding(version = 1) {
  const geometry = new BufferGeometry();
  const heights = [0, 0.1, 0.2, 0.65, 0.75, 1];
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(
    heights.flatMap((height, index) => [index % 2, height, 0]),
  ), 3));
  const smoothstep = (edge0, edge1, value) => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - (2 * t));
  };
  const regionBytes = heights.flatMap((sourceHeight) => {
    const height = Math.fround(sourceHeight);
    const base = Math.round((1 - smoothstep(0.12, 0.30, height)) * 255);
    const cap = Math.round(smoothstep(0.72, 0.86, height) * 255);
    const neck = Math.round(
      smoothstep(0.60, 0.70, height) * (1 - smoothstep(0.80, 0.89, height)) * 255,
    );
    return [base, 255 - base - cap, neck, cap];
  });
  geometry.setAttribute(
    ROCK_REGION_THREE_ATTRIBUTE,
    new BufferAttribute(new Uint8Array(regionBytes), 4, true),
  );
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.userData[ROCK_REGION_BINDING_KEY] = {
    schema: 'toonlab.rock-region-binding',
    version,
    profile: 'hoodoo-caprock-normalized-height-v1',
    attribute: ROCK_REGION_GLTF_ATTRIBUTE,
    encoding: 'unorm8',
    channels: [...ROCK_REGION_CHANNELS],
    space: 'mesh-local-normalized-height',
    failClosed: true,
    bands: {
      base: [0.12, 0.30],
      cap: [0.72, 0.86],
      neckEnter: [0.60, 0.70],
      neckExit: [0.80, 0.89],
    },
  };
  return mesh;
}

const valid = inspectRockRegionBinding(meshWithBinding());
assert.equal(valid.passed, true);
assert.equal(valid.count, 6);

assert.throws(
  () => inspectRockRegionBinding(meshWithBinding(2)),
  (error) => error?.code === 'TOONLAB_ROCK_REGION_BINDING_INVALID' && /version must be 1/u.test(error.message),
  'unsupported binding versions must fail instead of being silently reinterpreted',
);

assert.deepEqual(ROCK_REGION_CHANNELS, ['base', 'shaft', 'neck', 'cap']);
console.log('Rock-region schema migration verification passed: v1 admitted; v2 unsupported; no silent migration.');
