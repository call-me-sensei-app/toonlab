import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import {
  PROP_TYPES, buildProp, createPropAsset, createPropRecipeDocument, disposeProp,
} from '../../src/propgen/index.js';
import { downloadBlob } from '../shared/download.js';

function filename(name, extension) {
  const safe = String(name || 'prop').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'prop'}.${extension}`;
}

export function downloadPropRecipe(settings, name) {
  const document = createPropRecipeDocument(settings, { name });
  const json = JSON.stringify(document, null, 2);
  downloadBlob(json, filename(name, 'json'), 'application/json');
  return json;
}

export async function downloadPropGLB(settings, name) {
  // Linear types export the short default run (asset.build's 3-point line);
  // point types export the hi-detail hero build.
  const linear = Boolean(PROP_TYPES[settings.asset.type]?.linear);
  const root = linear
    ? createPropAsset(settings).build().object3D
    : buildProp(settings, { detail: 'hi' }).object3D;
  try {
    const buffer = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
    downloadBlob(buffer, filename(name, 'glb'), 'model/gltf-binary');
    return buffer.byteLength;
  } finally {
    disposeProp(root);
  }
}
