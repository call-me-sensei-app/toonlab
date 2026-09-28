// Run the public docs' CPU texture example to catch valid imports used wrongly.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { disposeTextureMapTextures } from '../src/texgen/index.js';
const docs = await readFile(new URL('../docs/main.jsx', import.meta.url), 'utf8');
const snippet = docs.match(/const TEXGEN_SNIPPET = `([\s\S]*?)`;/)?.[1];
assert.ok(snippet, 'Missing texture example');
const executable = snippet.replace(/import\s*\{([^}]*)\}\s*from\s*'([^']+)';/g, 'const {$1} = await import("$2");');
const material = new THREE.MeshStandardMaterial();
const result = await new (Object.getPrototypeOf(async function(){}).constructor)('material', `${executable}\nreturn {textures, maps};`)(material);
assert.equal(result.maps.size, 256);
assert.ok(material.map?.isDataTexture && material.normalMap?.isDataTexture);
assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace);
assert.equal(material.map.image.data.length, 256*256*4);
disposeTextureMapTextures(result.textures); material.dispose();
console.log('Executable documentation: texture generation, actual DataTexture assignment and color spaces passed.');
