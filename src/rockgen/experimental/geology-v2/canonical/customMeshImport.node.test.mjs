import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { sha256Bytes } from './customMesh.node.js';
import { normalizeC8BlenderCustomMesh } from './customMeshImport.node.js';
import { inspectC8ControlGlb } from './customMeshSampler.node.js';

if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((value) => {
        this.result = value;
        this.onloadend?.({ target: this });
      }, (error) => this.onerror?.(error));
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((value) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(value).toString('base64')}`;
        this.onloadend?.({ target: this });
      }, (error) => this.onerror?.(error));
    }
  };
}

async function cubeBytes(mutate = null) {
  const geometry = new THREE.BoxGeometry(2, 1, 2, 2, 2, 2);
  geometry.translate(0, 0.5, 0);
  mutate?.(geometry);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'CONTROL__TEST';
  const scene = new THREE.Scene();
  scene.add(mesh);
  const bytes = Buffer.from(await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    trs: false,
  }));
  geometry.dispose();
  material.dispose();
  return bytes;
}

function binding(bytes, overrides = {}) {
  return {
    blenderAuthoringSupportPlane: 'z=0',
    byteLength: bytes.byteLength,
    contentHash: sha256Bytes(bytes),
    coordinateSystem: 'right-handed-y-up',
    id: 'seamed-box-control',
    metreUnitScale: 1,
    ...overrides,
  };
}

function corruptAttribute(source, attribute, values) {
  const bytes = Buffer.from(source);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = header.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const accessor = document.accessors[document.meshes[0].primitives[0].attributes[attribute]];
  const bufferView = document.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  const binaryStart = 20 + jsonLength + 8;
  const start = binaryStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  values.forEach((value, index) => bytes.writeFloatLE(value, start + index * 4));
  return bytes;
}

test('normalizes a seam-split Blender GLB into deterministic canonical authority', async () => {
  const bytes = await cubeBytes();
  const first = await normalizeC8BlenderCustomMesh({ bytes, source: binding(bytes) });
  const second = await normalizeC8BlenderCustomMesh({ bytes, source: binding(bytes) });
  const inspection = inspectC8ControlGlb(first.bytes);
  assert.equal(first.audit.productionAuthority, true);
  assert.equal(first.audit.preservation.shapePreservingWithinPositionTolerance, true);
  assert.equal(first.audit.preservation.triangleCountPreserved, true);
  assert.ok(first.audit.source.vertexCountIncludingExportSeams > first.audit.normalization.weldedVertexCount);
  assert.equal(first.audit.normalization.weldedVertexCount, 26);
  assert.equal(inspection.triangleCount, 48);
  assert.equal(inspection.semanticValues.get('_TOONLAB_REGION').size, 3);
  assert.equal(sha256Bytes(first.bytes), sha256Bytes(second.bytes));
  assert.equal(first.audit.provenanceHash, second.audit.provenanceHash);
});

test('rejects source byte and topology hash drift', async () => {
  const bytes = await cubeBytes();
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes, source: binding(bytes, { contentHash: `sha256:${'0'.repeat(64)}` }) }),
    (error) => error.code === 'c8-import-content-hash-mismatch',
  );
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes, source: binding(bytes, { topologyHash: `sha256:${'0'.repeat(64)}` }) }),
    (error) => error.code === 'c8-import-source-topology-hash-mismatch',
  );
});

test('rejects UV and normal corruption before normalization', async () => {
  const uvBytes = corruptAttribute(await cubeBytes(), 'TEXCOORD_0', [2, 0]);
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes: uvBytes, source: binding(uvBytes) }),
    (error) => error.code === 'c8-import-uv-corruption',
  );
  const normalBytes = corruptAttribute(await cubeBytes(), 'NORMAL', [0, 0, 0]);
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes: normalBytes, source: binding(normalBytes) }),
    (error) => error.code === 'c8-import-normal-corruption',
  );
});

test('rejects open topology and weld-created topology drift', async () => {
  const openBytes = await cubeBytes((geometry) => {
    geometry.setIndex(Array.from(geometry.index.array).slice(3));
  });
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes: openBytes, source: binding(openBytes) }),
    (error) => error.code === 'nonmanifold-c8-import-weld',
  );
  const collapsedBytes = await cubeBytes((geometry) => {
    const position = geometry.getAttribute('position');
    position.setXYZ(1, position.getX(0), position.getY(0), position.getZ(0));
  });
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes: collapsedBytes, source: binding(collapsedBytes) }),
    (error) => error.code === 'c8-import-topology-drift',
  );
});

test('rejects ambiguous welds, support drift, and missing semantic coverage', async () => {
  const tolerance = 1e-4;
  const ambiguousBytes = await cubeBytes((geometry) => {
    const position = geometry.getAttribute('position');
    position.setXYZ(0, 0, 0, 0);
    position.setXYZ(1, tolerance * 1.5, 0, 0);
    position.setXYZ(2, tolerance * 0.75, 0, 0);
  });
  await assert.rejects(
    normalizeC8BlenderCustomMesh({
      bytes: ambiguousBytes,
      options: { tolerances: { positionWeldMetres: tolerance } },
      source: binding(ambiguousBytes),
    }),
    (error) => error.code === 'ambiguous-c8-import-weld',
  );

  const raisedBytes = await cubeBytes((geometry) => geometry.translate(0, 0.1, 0));
  await assert.rejects(
    normalizeC8BlenderCustomMesh({ bytes: raisedBytes, source: binding(raisedBytes) }),
    (error) => error.code === 'c8-import-support-plane-mismatch',
  );

  const bytes = await cubeBytes();
  await assert.rejects(
    normalizeC8BlenderCustomMesh({
      bytes,
      options: { rules: { minimumRegionVertices: 20 } },
      source: binding(bytes),
    }),
    (error) => error.code === 'missing-c8-import-region-coverage',
  );
});
